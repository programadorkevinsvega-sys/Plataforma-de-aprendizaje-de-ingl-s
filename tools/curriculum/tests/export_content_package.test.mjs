import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { exportCurriculumPackage } from "../export_content_package.mjs";
import { importCurriculumPackage } from "../import_content_package.mjs";

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
    [editorId, `${editorId}@curriculum-export-test.invalid`, "ci-test-password-hash", "CI Curriculum Editor"],
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
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-curriculum-export-test-"));
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

async function seedAndImport({ explicitContentSchemaVersion }) {
  const data = structuredClone(JSON.parse(readFileSync(FIXTURE, "utf8")));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  data.course.slug = `phase13-export-${suffix}`;
  if (explicitContentSchemaVersion) {
    data.version.content_schema_version = data.schema_version;
  }

  const wordIds = [];
  const sentenceIds = [];
  const originalReferences = [];
  const wordByOriginalName = new Map();

  try {
    for (const objective of data.objectives) {
      for (const [index, reference] of (objective.vocabulary ?? []).entries()) {
        const original = { objective: objective.code, word: reference.word };
        const word = `export-${suffix}-${objective.code}-${index}`.slice(0, 100);
        const category = `export_${suffix}`;
        const inserted = await pool.query(
          `INSERT INTO vocabulary_words (
              word, spanish_phonetic, spanish_translation, category, level,
              spanish_phonetic_natural
           )
           VALUES ($1, $2, $3, $4, 'PRE_A1', $2)
           RETURNING id`,
          [word, "pronunciación de prueba", "traducción de prueba", category],
        );
        wordIds.push(inserted.rows[0].id);
        wordByOriginalName.set(`${objective.code}:${reference.word.toLowerCase()}`, {
          word, category, id: inserted.rows[0].id,
        });
        originalReferences.push(original);
        reference.word = word;
        reference.category = category;
      }

      for (const [index, reference] of (objective.sentences ?? []).entries()) {
        const match = wordByOriginalName.get(`${objective.code}:${reference.word.toLowerCase()}`);
        assert.ok(match, `Sentence word must resolve to seeded vocabulary: ${reference.word}`);
        const englishText = `Export fixture ${suffix} ${objective.code} sentence ${index}.`;
        const inserted = await pool.query(
          `INSERT INTO context_sentences (
              word_id, english_text, spanish_phonetic, spanish_translation,
              spanish_phonetic_natural
           )
           VALUES ($1, $2, $3, $4, $3)
           RETURNING id`,
          [match.id, englishText, "frase fonética", "frase de prueba"],
        );
        sentenceIds.push(inserted.rows[0].id);
        reference.word = match.word;
        reference.english_text = englishText;
      }
    }

    const packageSha256 = canonicalHash(data);
    const imported = await importCurriculumPackage(pool, data, packageSha256, { apply: true, actorUserId: editorId });
    assert.equal(imported.state, "imported");

    return {
      data,
      packageSha256,
      cleanup: async () => {
        const courses = await pool.query("SELECT id FROM courses WHERE slug = $1", [data.course.slug]);
        for (const course of courses.rows) {
          const versions = await pool.query("SELECT id FROM course_versions WHERE course_id = $1", [course.id]);
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
          await pool.query("DELETE FROM courses WHERE id = $1", [course.id]);
        }
        if (sentenceIds.length > 0) {
          await pool.query("DELETE FROM context_sentences WHERE id = ANY($1::uuid[])", [sentenceIds]);
        }
        if (wordIds.length > 0) {
          await pool.query("DELETE FROM vocabulary_words WHERE id = ANY($1::uuid[])", [wordIds]);
        }
      },
    };
  } catch (error) {
    if (sentenceIds.length > 0) {
      await pool.query("DELETE FROM context_sentences WHERE id = ANY($1::uuid[])", [sentenceIds]).catch(() => {});
    }
    if (wordIds.length > 0) {
      await pool.query("DELETE FROM vocabulary_words WHERE id = ANY($1::uuid[])", [wordIds]).catch(() => {});
    }
    throw error;
  }
}

if (!DATABASE_URL) {
  test("curriculum export integration tests require DATABASE_URL", { skip: true }, () => {});
} else {
  test("rejects an unregistered actor for package export", async () => {
    const seeded = await seedAndImport({ explicitContentSchemaVersion: false });
    try {
      await assert.rejects(
        exportCurriculumPackage(pool, {
          course: seeded.data.course.slug,
          level: seeded.data.version.cefr_level,
          versionNumber: seeded.data.version.version_number,
        }, { actorUserId: randomUUID() }),
        /not registered as a curriculum content editor/,
      );
    } finally {
      await seeded.cleanup();
    }
  });

  test("exports relational curriculum data to the same canonical package and hash", async () => {
    const seeded = await seedAndImport({ explicitContentSchemaVersion: true });
    try {
      const exported = await exportCurriculumPackage(pool, {
        course: seeded.data.course.slug,
        level: seeded.data.version.cefr_level,
        versionNumber: seeded.data.version.version_number,
      }, { actorUserId: editorId });
      assert.equal(exported.status, "draft");
      assert.equal(exported.packageSha256, seeded.packageSha256);
      assert.equal(canonicalHash(exported.data), seeded.packageSha256);
      assert.deepEqual(exported.data.version, seeded.data.version);
      assert.deepEqual(exported.data.metadata, seeded.data.metadata);
      assert.equal(exported.data.units.length, seeded.data.units.length);
      assert.equal(exported.data.units[0].lessons.length, seeded.data.units[0].lessons.length);
    } finally {
      await seeded.cleanup();
    }
  });

  test("export preserves omission of optional content_schema_version", async () => {
    const seeded = await seedAndImport({ explicitContentSchemaVersion: false });
    try {
      const exported = await exportCurriculumPackage(pool, {
        course: seeded.data.course.slug,
        level: seeded.data.version.cefr_level,
        versionNumber: seeded.data.version.version_number,
      }, { actorUserId: editorId });
      assert.equal(Object.hasOwn(exported.data.version, "content_schema_version"), false);
      assert.equal(exported.packageSha256, seeded.packageSha256);
    } finally {
      await seeded.cleanup();
    }
  });

  test("export fails closed when relational content drifts from its package fingerprint", async () => {
    const seeded = await seedAndImport({ explicitContentSchemaVersion: false });
    try {
      await pool.query(
        `UPDATE course_units
            SET title = 'Tampered after import'
          WHERE course_version_id = (
              SELECT version.id
                FROM courses course
                JOIN course_versions version ON version.course_id = course.id
               WHERE course.slug = $1
          )`,
        [seeded.data.course.slug],
      );

      await assert.rejects(
        exportCurriculumPackage(pool, {
          course: seeded.data.course.slug,
          level: seeded.data.version.cefr_level,
          versionNumber: seeded.data.version.version_number,
        }, { actorUserId: editorId }),
        /Export integrity check failed/,
      );
    } finally {
      await seeded.cleanup();
    }
  });
}
