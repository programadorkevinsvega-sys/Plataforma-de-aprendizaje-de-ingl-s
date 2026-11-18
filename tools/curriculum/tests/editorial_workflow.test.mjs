import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importCurriculumPackage } from "../import_content_package.mjs";
import { manageCourseVersion } from "../manage_course_version.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = path.join(ROOT, "tests/fixtures/curriculum/phase1_3_content_package_v1.json");
const VALIDATOR = path.join(ROOT, "tools/curriculum/validate_content_package.py");
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 4 }) : null;
const editorId = randomUUID();

before(async () => {
  if (!pool) return;
  await pool.query(
    "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)",
    [editorId, `${editorId}@curriculum-editorial-test.invalid`, "ci-test-password-hash", "CI Curriculum Editor"],
  );
  await pool.query("INSERT INTO content_editors (user_id) VALUES ($1)", [editorId]);
});

after(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM content_editors WHERE user_id = $1", [editorId]);
  await pool.query("DELETE FROM users WHERE id = $1", [editorId]);
  await pool.end();
});

function canonicalHash(data) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-curriculum-editorial-test-"));
  const file = path.join(directory, "package.json");
  try {
    writeFileSync(file, JSON.stringify(data), "utf8");
    const result = spawnSync("python3", [VALIDATOR, file, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout).sha256;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function seedDraftVersion() {
  const data = structuredClone(JSON.parse(readFileSync(FIXTURE, "utf8")));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  data.course.slug = `phase13-editorial-${suffix}`;
  for (const objective of data.objectives) {
    objective.vocabulary = [];
    objective.sentences = [];
  }
  const packageSha256 = canonicalHash(data);
  const imported = await importCurriculumPackage(pool, data, packageSha256, {
    apply: true,
    actorUserId: editorId,
  });
  assert.equal(imported.state, "imported");

  const selector = {
    course: data.course.slug,
    level: data.version.cefr_level,
    versionNumber: data.version.version_number,
  };

  return {
    data,
    selector,
    cleanup: async () => {
      const course = await pool.query("SELECT id FROM courses WHERE slug = $1", [data.course.slug]);
      for (const courseRow of course.rows) {
        const versions = await pool.query("SELECT id FROM course_versions WHERE course_id = $1", [courseRow.id]);
        for (const version of versions.rows) {
          const id = version.id;
          await pool.query("DELETE FROM course_version_reviews WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM lesson_prerequisites WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM lesson_learning_objectives WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM learning_objective_skills WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM learning_objective_vocabulary WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM learning_objective_sentences WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM course_lessons WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM course_units WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM learning_objectives WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM curriculum_content_package_imports WHERE course_version_id = $1", [id]);
          await pool.query("DELETE FROM course_versions WHERE id = $1", [id]);
        }
        await pool.query("DELETE FROM courses WHERE id = $1", [courseRow.id]);
      }
    },
  };
}

if (!DATABASE_URL) {
  test("curriculum editorial integration tests require DATABASE_URL", { skip: true }, () => {});
} else {
  test("editor capability depends on the registered transaction-local user identity", async () => {
    const client = await pool.connect();
    const unregisteredId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.content_editor', 'true', true)");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [unregisteredId]);
      let result = await client.query("SELECT app_is_content_editor() AS allowed");
      assert.equal(result.rows[0].allowed, false);

      await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      result = await client.query("SELECT app_is_content_editor() AS allowed");
      assert.equal(result.rows[0].allowed, true);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  test("supports draft -> review -> changes requested -> draft -> approved review", async () => {
    const seeded = await seedDraftVersion();
    try {
      const drySubmit = await manageCourseVersion(pool, {
        action: "submit",
        ...seeded.selector,
      }, { actorUserId: editorId });
      assert.equal(drySubmit.nextStatus, "review");
      assert.equal(drySubmit.dryRun, true);

      let state = await pool.query(
        `SELECT status FROM course_versions
          WHERE id = (SELECT version.id FROM courses course JOIN course_versions version
                      ON version.course_id = course.id WHERE course.slug = $1)`,
        [seeded.selector.course],
      );
      assert.equal(state.rows[0].status, "draft");

      await manageCourseVersion(pool, {
        action: "submit",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });

      const requested = await manageCourseVersion(pool, {
        action: "review",
        decision: "changes_requested",
        comments: "Please improve the example before approval.",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });
      assert.equal(requested.nextStatus, "draft");

      await manageCourseVersion(pool, {
        action: "submit",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });

      const approved = await manageCourseVersion(pool, {
        action: "review",
        decision: "approved",
        comments: "Content review passed.",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });
      assert.equal(approved.nextStatus, "review");

      state = await pool.query(
        `SELECT version.status,
                (SELECT count(*)::int FROM course_version_reviews review
                  WHERE review.course_version_id = version.id) AS review_count,
                (SELECT decision FROM course_version_reviews review
                  WHERE review.course_version_id = version.id
                  ORDER BY reviewed_at DESC, id DESC LIMIT 1) AS latest_decision
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [seeded.selector.course],
      );
      assert.equal(state.rows[0].status, "review");
      assert.equal(state.rows[0].review_count, 2);
      assert.equal(state.rows[0].latest_decision, "approved");
    } finally {
      await seeded.cleanup();
    }
  });

  test("publishes only after the latest approved review by the same registered editor", async () => {
    const seeded = await seedDraftVersion();
    try {
      await manageCourseVersion(pool, {
        action: "submit",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });
      await manageCourseVersion(pool, {
        action: "review",
        decision: "approved",
        comments: "Approved for publication.",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });

      const dryPublish = await manageCourseVersion(pool, {
        action: "publish",
        ...seeded.selector,
      }, { actorUserId: editorId });
      assert.equal(dryPublish.nextStatus, "published");
      assert.equal(dryPublish.dryRun, true);

      const state = await pool.query(
        `SELECT status, published_at FROM course_versions
          WHERE id = (SELECT version.id FROM courses course JOIN course_versions version
                      ON version.course_id = course.id WHERE course.slug = $1)`,
        [seeded.selector.course],
      );
      assert.equal(state.rows[0].status, "review");
      assert.equal(state.rows[0].published_at, null);
    } finally {
      await seeded.cleanup();
    }
  });

  test("rejects review decisions without comments unless approved", async () => {
    const seeded = await seedDraftVersion();
    try {
      await manageCourseVersion(pool, {
        action: "submit",
        ...seeded.selector,
      }, { actorUserId: editorId, apply: true });

      await assert.rejects(
        manageCourseVersion(pool, {
          action: "review",
          decision: "rejected",
          comments: "",
          ...seeded.selector,
        }, { actorUserId: editorId, apply: true }),
        /non-empty --comments|comments/,
      );
    } finally {
      await seeded.cleanup();
    }
  });
}
