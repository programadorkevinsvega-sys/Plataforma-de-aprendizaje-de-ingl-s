import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { importCurriculumPackage } from "../import_content_package.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = path.join(ROOT, "tests/fixtures/curriculum/phase1_3_content_package_v1.json");
const VALIDATOR = path.join(ROOT, "tools/curriculum/validate_content_package.py");
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 4 }) : null;

after(async () => {
  await pool?.end();
});

function canonicalHash(data) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-curriculum-"));
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

async function seedPackage() {
  const data = structuredClone(JSON.parse(readFileSync(FIXTURE, "utf8")));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  data.course.slug = `phase13-import-${suffix}`;

  const seededWordIds = [];
  const seededSentenceIds = [];
  const replacements = new Map();

  try {
    for (const objective of data.objectives) {
      for (const [index, reference] of (objective.vocabulary ?? []).entries()) {
        const originalWord = reference.word;
        const word = `p13-${suffix}-${objective.code}-${index}`.slice(0, 100);
        const category = `test_${suffix}`;
        const inserted = await pool.query(
          `INSERT INTO vocabulary_words (
              word, spanish_phonetic, spanish_translation, category, level,
              spanish_phonetic_natural
           )
           VALUES ($1, $2, $3, $4, 'PRE_A1', $2)
           RETURNING id`,
          [word, "prueba fonética", "traducción de prueba", category],
        );
        seededWordIds.push(inserted.rows[0].id);
        replacements.set(`${objective.code}:${originalWord.toLowerCase()}`, {
          word,
          category,
          id: inserted.rows[0].id,
        });
        reference.word = word;
        reference.category = category;
      }

      for (const [index, reference] of (objective.sentences ?? []).entries()) {
        const match = replacements.get(`${objective.code}:${reference.word.toLowerCase()}`);
        assert.ok(match, `Fixture sentence word must have a vocabulary reference: ${reference.word}`);
        const englishText = `Test sentence ${suffix} ${objective.code} ${index}.`;
        const inserted = await pool.query(
          `INSERT INTO context_sentences (
              word_id, english_text, spanish_phonetic, spanish_translation,
              spanish_phonetic_natural
           )
           VALUES ($1, $2, $3, $4, $3)
           RETURNING id`,
          [match.id, englishText, "frase fonética de prueba", "frase de prueba"],
        );
        seededSentenceIds.push(inserted.rows[0].id);
        reference.word = match.word;
        reference.english_text = englishText;
      }
    }

    return {
      data,
      packageSha256: canonicalHash(data),
      cleanup: async () => {
        const courses = await pool.query("SELECT id FROM courses WHERE slug = $1", [data.course.slug]);
        for (const course of courses.rows) {
          const versions = await pool.query(
            "SELECT id FROM course_versions WHERE course_id = $1",
            [course.id],
          );
          for (const version of versions.rows) {
            const id = version.id;
            await pool.query("DELETE FROM curriculum_content_package_imports WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM course_version_reviews WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM lesson_prerequisites WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM lesson_learning_objectives WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM learning_objective_skills WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM learning_objective_vocabulary WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM learning_objective_sentences WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM course_lessons WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM course_units WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM learning_objectives WHERE course_version_id = $1", [id]);
            await pool.query("DELETE FROM course_versions WHERE id = $1", [id]);
          }
          await pool.query("DELETE FROM courses WHERE id = $1", [course.id]);
        }
        if (seededSentenceIds.length > 0) {
          await pool.query("DELETE FROM context_sentences WHERE id = ANY($1::uuid[])", [seededSentenceIds]);
        }
        if (seededWordIds.length > 0) {
          await pool.query("DELETE FROM vocabulary_words WHERE id = ANY($1::uuid[])", [seededWordIds]);
        }
      },
    };
  } catch (error) {
    if (seededSentenceIds.length > 0) {
      await pool.query("DELETE FROM context_sentences WHERE id = ANY($1::uuid[])", [seededSentenceIds]);
    }
    if (seededWordIds.length > 0) {
      await pool.query("DELETE FROM vocabulary_words WHERE id = ANY($1::uuid[])", [seededWordIds]);
    }
    throw error;
  }
}

if (!DATABASE_URL) {
  test("curriculum importer integration tests require DATABASE_URL", { skip: true }, () => {});
} else {
  test("imports a new draft version and resolves all existing references", async () => {
    const seeded = await seedPackage();
    try {
      const result = await importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true });
      assert.equal(result.state, "imported");
      assert.equal(result.applied, true);
      assert.equal(result.units, 1);
      assert.equal(result.lessons, 2);
      assert.equal(result.objectives, 2);
      assert.equal(result.vocabularyReferences, 2);
      assert.equal(result.sentenceReferences, 1);

      const version = await pool.query(
        `SELECT version.id, version.status, imported.package_sha256, imported.metadata
           FROM courses AS course
           JOIN course_versions AS version ON version.course_id = course.id
           JOIN curriculum_content_package_imports AS imported
             ON imported.course_version_id = version.id
          WHERE course.slug = $1`,
        [seeded.data.course.slug],
      );
      assert.equal(version.rowCount, 1);
      assert.equal(version.rows[0].status, "draft");
      assert.equal(version.rows[0].package_sha256, seeded.packageSha256);
      assert.equal(version.rows[0].metadata.author, seeded.data.metadata.author);
    } finally {
      await seeded.cleanup();
    }
  });

  test("re-importing identical content is an idempotent no-op", async () => {
    const seeded = await seedPackage();
    try {
      const first = await importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true });
      const second = await importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true });
      assert.equal(first.state, "imported");
      assert.equal(second.state, "already_imported");
      assert.equal(second.applied, false);

      const count = await pool.query(
        `SELECT count(*)::int AS total
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [seeded.data.course.slug],
      );
      assert.equal(count.rows[0].total, 1);
    } finally {
      await seeded.cleanup();
    }
  });

  test("rejects different content for an existing version without overwriting it", async () => {
    const seeded = await seedPackage();
    try {
      await importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true });
      const changed = structuredClone(seeded.data);
      changed.version.title = "Different title for same version";
      const changedHash = canonicalHash(changed);

      await assert.rejects(
        importCurriculumPackage(pool, changed, changedHash, { apply: true }),
        /already exists with different content/,
      );

      const version = await pool.query(
        `SELECT version.title
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [seeded.data.course.slug],
      );
      assert.equal(version.rows[0].title, seeded.data.version.title);
    } finally {
      await seeded.cleanup();
    }
  });

  test("dry run validates full inserts but leaves no curriculum records", async () => {
    const seeded = await seedPackage();
    try {
      const result = await importCurriculumPackage(pool, seeded.data, seeded.packageSha256);
      assert.equal(result.state, "imported");
      assert.equal(result.dryRun, true);
      assert.equal(result.applied, false);

      const count = await pool.query("SELECT count(*)::int AS total FROM courses WHERE slug = $1", [
        seeded.data.course.slug,
      ]);
      assert.equal(count.rows[0].total, 0);
    } finally {
      await seeded.cleanup();
    }
  });

  test("missing external references roll back the entire import", async () => {
    const seeded = await seedPackage();
    try {
      await pool.query(
        "DELETE FROM vocabulary_words WHERE word = ANY($1::varchar[])",
        [seeded.data.objectives.flatMap((objective) => (objective.vocabulary ?? []).map((ref) => ref.word))],
      );
      await assert.rejects(
        importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true }),
        /External curriculum reference not found/,
      );

      const count = await pool.query("SELECT count(*)::int AS total FROM courses WHERE slug = $1", [
        seeded.data.course.slug,
      ]);
      assert.equal(count.rows[0].total, 0);
    } finally {
      await seeded.cleanup();
    }
  });

  test("concurrent imports of one version serialize and create exactly one version", async () => {
    const seeded = await seedPackage();
    try {
      const [first, second] = await Promise.all([
        importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true }),
        importCurriculumPackage(pool, seeded.data, seeded.packageSha256, { apply: true }),
      ]);
      assert.deepEqual(
        [first.state, second.state].sort(),
        ["already_imported", "imported"],
      );

      const count = await pool.query(
        `SELECT count(*)::int AS total
           FROM courses course
           JOIN course_versions version ON version.course_id = course.id
          WHERE course.slug = $1`,
        [seeded.data.course.slug],
      );
      assert.equal(count.rows[0].total, 1);
    } finally {
      await seeded.cleanup();
    }
  });
}
