import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import pg from "pg";
import { applyEditorialAction } from "../manage_course_version.mjs";

const { Pool } = pg;
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

async function withDraftVersion(run) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
    const slug = `editorial-test-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const course = await client.query(
      "INSERT INTO courses (slug, track_code) VALUES ($1, 'general') RETURNING id",
      [slug],
    );
    const version = await client.query(
      `INSERT INTO course_versions (
          course_id, version_number, status, cefr_level, title, description, locale
       )
       VALUES ($1, 1, 'draft', 'PRE_A1', 'Editorial test', 'Temporary transaction fixture', 'en')
       RETURNING id`,
      [course.rows[0].id],
    );
    const courseVersionId = version.rows[0].id;
    const unit = await client.query(
      `INSERT INTO course_units (course_version_id, unit_code, position, title, theme)
       VALUES ($1, 'unit-01', 1, 'Test unit', 'Introductions')
       RETURNING id`,
      [courseVersionId],
    );
    const lesson = await client.query(
      `INSERT INTO course_lessons (
          course_version_id, unit_id, lesson_code, position, lesson_pattern, title
       )
       VALUES ($1, $2, 'lesson-01', 1, 'practice', 'Test lesson')
       RETURNING id`,
      [courseVersionId, unit.rows[0].id],
    );
    const objective = await client.query(
      `INSERT INTO learning_objectives (
          course_version_id, objective_code, description, success_criteria, position
       )
       VALUES ($1, 'objective-01', 'Understand a basic greeting', 'Identify four of five greetings', 1)
       RETURNING id`,
      [courseVersionId],
    );
    await client.query(
      `INSERT INTO learning_objective_skills (
          course_version_id, learning_objective_id, skill_code, is_primary
       )
       VALUES ($1, $2, 'vocabulary', TRUE)`,
      [courseVersionId, objective.rows[0].id],
    );
    await client.query(
      `INSERT INTO lesson_learning_objectives (
          course_version_id, lesson_id, learning_objective_id, position, is_required
       )
       VALUES ($1, $2, $3, 1, TRUE)`,
      [courseVersionId, lesson.rows[0].id, objective.rows[0].id],
    );
    const selector = { course: slug, level: "PRE_A1", versionNumber: 1 };
    await run(client, selector);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
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
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  test("supports draft -> review -> changes requested -> draft -> approved review", async () => {
    await withDraftVersion(async (client, selector) => {
      const submitted = await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });
      assert.equal(submitted.nextStatus, "review");

      const requested = await applyEditorialAction(client, {
        action: "review",
        decision: "changes_requested",
        comments: "Please improve the example before approval.",
        ...selector,
        actorUserId: editorId,
      });
      assert.equal(requested.nextStatus, "draft");

      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });

      const approved = await applyEditorialAction(client, {
        action: "review",
        decision: "approved",
        comments: "Content review passed.",
        ...selector,
        actorUserId: editorId,
      });
      assert.equal(approved.nextStatus, "review");

      const state = await client.query(
        `SELECT version.status,
                (SELECT count(*)::int FROM course_version_reviews review
                  WHERE review.course_version_id = version.id) AS review_count,
                (SELECT decision FROM course_version_reviews review
                  WHERE review.course_version_id = version.id
                  ORDER BY review_order DESC LIMIT 1) AS latest_decision
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [selector.course],
      );
      assert.equal(state.rows[0].status, "review");
      assert.equal(state.rows[0].review_count, 2);
      assert.equal(state.rows[0].latest_decision, "approved");
    });
  });

  test("publishes only after the latest approved review by the same registered editor", async () => {
    await withDraftVersion(async (client, selector) => {
      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });
      await applyEditorialAction(client, {
        action: "review",
        decision: "approved",
        comments: "Approved for publication.",
        ...selector,
        actorUserId: editorId,
      });

      const published = await applyEditorialAction(client, {
        action: "publish",
        ...selector,
        actorUserId: editorId,
      });
      assert.equal(published.nextStatus, "published");

      const state = await client.query(
        `SELECT status, published_at, reviewed_by
           FROM course_versions
          WHERE id = (
              SELECT version.id
                FROM courses course
                JOIN course_versions version ON version.course_id = course.id
               WHERE course.slug = $1
          )`,
        [selector.course],
      );
      assert.equal(state.rows[0].status, "published");
      assert.ok(state.rows[0].published_at);
      assert.equal(state.rows[0].reviewed_by, editorId);
    });
  });

  test("database refuses publication when a lesson has no required learning objective", async () => {
    await withDraftVersion(async (client, selector) => {
      const version = await client.query(
        `SELECT version.id
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [selector.course],
      );
      await client.query(
        "DELETE FROM lesson_learning_objectives WHERE course_version_id = $1",
        [version.rows[0].id],
      );

      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });
      await applyEditorialAction(client, {
        action: "review",
        decision: "approved",
        comments: "Approved despite deliberately incomplete draft content.",
        ...selector,
        actorUserId: editorId,
      });

      await assert.rejects(
        applyEditorialAction(client, {
          action: "publish",
          ...selector,
          actorUserId: editorId,
        }),
        /Every lesson must have at least one required learning objective with non-empty success criteria/,
      );
    });
  });

  test("database refuses publication when an objective has no primary skill", async () => {
    await withDraftVersion(async (client, selector) => {
      const version = await client.query(
        `SELECT version.id
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [selector.course],
      );
      await client.query(
        `DELETE FROM learning_objective_skills
          WHERE course_version_id = $1`,
        [version.rows[0].id],
      );

      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });
      await applyEditorialAction(client, {
        action: "review",
        decision: "approved",
        comments: "Approved despite deliberately incomplete draft content.",
        ...selector,
        actorUserId: editorId,
      });

      await assert.rejects(
        applyEditorialAction(client, {
          action: "publish",
          ...selector,
          actorUserId: editorId,
        }),
        /Every learning objective must have exactly one primary skill/,
      );
    });
  });

  test("freezes child content while a course version is under review", async () => {
    await withDraftVersion(async (client, selector) => {
      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });

      await assert.rejects(
        client.query(
          `UPDATE course_lessons
              SET title = 'Mutated after review submission'
            WHERE course_version_id = (
                SELECT version.id
                  FROM courses course
                  JOIN course_versions version ON version.course_id = course.id
                 WHERE course.slug = $1
            )`,
          [selector.course],
        ),
        /Curriculum content is frozen while its course version is under review or published/,
      );
    });
  });

  test("allows child content edits again after a review requests changes", async () => {
    await withDraftVersion(async (client, selector) => {
      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });
      const requested = await applyEditorialAction(client, {
        action: "review",
        decision: "changes_requested",
        comments: "Please make the lesson example clearer.",
        ...selector,
        actorUserId: editorId,
      });
      assert.equal(requested.nextStatus, "draft");

      const updated = await client.query(
        `UPDATE course_lessons
            SET title = 'Revised test lesson'
          WHERE course_version_id = (
              SELECT version.id
                FROM courses course
                JOIN course_versions version ON version.course_id = course.id
               WHERE course.slug = $1
          )
          RETURNING title`,
        [selector.course],
      );
      assert.equal(updated.rows[0].title, "Revised test lesson");
    });
  });

  test("rejects review decisions without comments and does not change the state", async () => {
    await withDraftVersion(async (client, selector) => {
      await applyEditorialAction(client, {
        action: "submit",
        ...selector,
        actorUserId: editorId,
      });

      await assert.rejects(
        applyEditorialAction(client, {
          action: "review",
          decision: "rejected",
          comments: "",
          ...selector,
          actorUserId: editorId,
        }),
        /non-empty comments/,
      );

      const state = await client.query(
        `SELECT status FROM course_versions
          WHERE id = (
              SELECT version.id
                FROM courses course
                JOIN course_versions version ON version.course_id = course.id
               WHERE course.slug = $1
          )`,
        [selector.course],
      );
      assert.equal(state.rows[0].status, "review");
    });
  });
}
