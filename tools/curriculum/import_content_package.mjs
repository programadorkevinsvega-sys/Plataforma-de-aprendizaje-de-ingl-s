#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATOR = path.join(ROOT, "tools/curriculum/validate_content_package.py");

function usage() {
  return [
    "Usage:",
    "  node tools/curriculum/import_content_package.mjs <package.json> --actor-user-id <uuid> [--apply]",
    "",
    "The default mode is a database-backed dry run: it resolves every external",
    "vocabulary/sentence reference and rolls back all writes.",
    "Pass --apply to persist the package as a new draft course version.",
    "The actor must be pre-registered in public.content_editors.",
    "DATABASE_URL must point to a trusted PostgreSQL import connection.",
  ].join("\n");
}

function readValidatedPackage(packagePath) {
  const python = process.env.PYTHON ?? "python3";
  const validation = spawnSync(python, [VALIDATOR, packagePath, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });

  if (validation.error) {
    throw new Error(`Could not run curriculum package validator: ${validation.error.message}`);
  }

  let result;
  try {
    result = JSON.parse(validation.stdout);
  } catch {
    throw new Error(
      `Curriculum package validator did not return valid JSON: ${validation.stderr || validation.stdout}`,
    );
  }

  if (validation.status !== 0 || result.valid !== true) {
    const errors = Array.isArray(result.errors) ? result.errors.join("\n") : "unknown validation error";
    throw new Error(`Curriculum package is invalid:\n${errors}`);
  }

  return readFile(packagePath, "utf8").then((raw) => ({
    data: JSON.parse(raw),
    packageSha256: result.sha256,
    validation: result,
  }));
}

function requireSingleRow(rows, description) {
  if (rows.length === 0) {
    throw new Error(`External curriculum reference not found: ${description}`);
  }
  if (rows.length > 1) {
    throw new Error(`External curriculum reference is ambiguous: ${description}`);
  }
  return rows[0].id;
}

async function resolveVocabularyId(client, reference) {
  const result = await client.query(
    `SELECT id
       FROM vocabulary_words
      WHERE lower(btrim(word)) = lower(btrim($1))
        AND lower(btrim(category)) = lower(btrim($2))
      ORDER BY id
      LIMIT 2`,
    [reference.word, reference.category],
  );

  return requireSingleRow(
    result.rows,
    `vocabulary word "${reference.word}" in category "${reference.category}"`,
  );
}

async function resolveSentenceId(client, reference) {
  const result = await client.query(
    `SELECT sentence.id
       FROM context_sentences AS sentence
       JOIN vocabulary_words AS word ON word.id = sentence.word_id
      WHERE lower(btrim(word.word)) = lower(btrim($1))
        AND lower(btrim(sentence.english_text)) = lower(btrim($2))
      ORDER BY sentence.id
      LIMIT 2`,
    [reference.word, reference.english_text],
  );

  return requireSingleRow(
    result.rows,
    `context sentence for "${reference.word}": "${reference.english_text}"`,
  );
}

async function insertPackage(client, data, packageSha256) {
  // Lock at course scope so simultaneous imports of different levels or
  // versions cannot race while creating the stable course identity.
  const lockKey = `course:${data.course.slug}`;

  // Serialize two imports of the same logical version. A second importer sees
  // the committed package ledger and becomes a deterministic no-op.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);

  const courseResult = await client.query(
    "SELECT id, track_code FROM courses WHERE slug = $1 FOR UPDATE",
    [data.course.slug],
  );

  let courseId;
  if (courseResult.rows.length > 1) {
    throw new Error(`Course identity is ambiguous for slug "${data.course.slug}".`);
  }
  if (courseResult.rows.length === 1) {
    courseId = courseResult.rows[0].id;
    if (courseResult.rows[0].track_code !== data.course.track_code) {
      throw new Error(
        `Course "${data.course.slug}" already exists with track "${courseResult.rows[0].track_code}", not "${data.course.track_code}".`,
      );
    }
  } else {
    const insertedCourse = await client.query(
      "INSERT INTO courses (slug, track_code) VALUES ($1, $2) RETURNING id",
      [data.course.slug, data.course.track_code],
    );
    courseId = insertedCourse.rows[0].id;
  }

  const existingVersion = await client.query(
    `SELECT version.id, version.status, imported.package_sha256
       FROM course_versions AS version
       LEFT JOIN curriculum_content_package_imports AS imported
         ON imported.course_version_id = version.id
      WHERE version.course_id = $1
        AND version.cefr_level = $2
        AND version.version_number = $3
      FOR UPDATE OF version`,
    [courseId, data.version.cefr_level, data.version.version_number],
  );

  if (existingVersion.rows.length > 0) {
    const existing = existingVersion.rows[0];
    if (existing.package_sha256 === packageSha256) {
      return {
        state: "already_imported",
        courseVersionId: existing.id,
        existingStatus: existing.status,
        packageSha256,
        units: 0,
        lessons: 0,
        objectives: 0,
        vocabularyReferences: 0,
        sentenceReferences: 0,
      };
    }
    if (!existing.package_sha256) {
      throw new Error(
        `Course version "${data.course.slug}/${data.version.cefr_level}/${data.version.version_number}" already exists without an import fingerprint. It will not be overwritten.`,
      );
    }
    throw new Error(
      `Course version "${data.course.slug}/${data.version.cefr_level}/${data.version.version_number}" already exists with different content. Increment version_number instead of overwriting it.`,
    );
  }

  const versionResult = await client.query(
    `INSERT INTO course_versions (
        course_id, version_number, status, cefr_level, title, description,
        locale, content_schema_version
     )
     VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      courseId,
      data.version.version_number,
      data.version.cefr_level,
      data.version.title,
      data.version.description ?? "",
      data.version.locale,
      data.version.content_schema_version ?? data.schema_version,
    ],
  );
  const courseVersionId = versionResult.rows[0].id;

  const unitIds = new Map();
  const lessonIds = new Map();
  const objectiveIds = new Map();

  for (const unit of data.units) {
    const result = await client.query(
      `INSERT INTO course_units (
          course_version_id, unit_code, position, title, theme, description, estimated_minutes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        courseVersionId,
        unit.code,
        unit.position,
        unit.title,
        unit.theme,
        unit.description ?? "",
        unit.estimated_minutes ?? null,
      ],
    );
    unitIds.set(unit.code, result.rows[0].id);
  }

  for (const objective of data.objectives) {
    const result = await client.query(
      `INSERT INTO learning_objectives (
          course_version_id, objective_code, description, success_criteria, position
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        courseVersionId,
        objective.code,
        objective.description,
        objective.success_criteria,
        objective.position,
      ],
    );
    const objectiveId = result.rows[0].id;
    objectiveIds.set(objective.code, objectiveId);

    for (const skill of objective.skills) {
      await client.query(
        `INSERT INTO learning_objective_skills (
            course_version_id, learning_objective_id, skill_code, is_primary
         )
         VALUES ($1, $2, $3, $4)`,
        [courseVersionId, objectiveId, skill.code, skill.is_primary],
      );
    }
  }

  for (const unit of data.units) {
    const unitId = unitIds.get(unit.code);
    for (const lesson of unit.lessons) {
      const result = await client.query(
        `INSERT INTO course_lessons (
            course_version_id, unit_id, lesson_code, position, lesson_pattern,
            title, description, estimated_minutes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          courseVersionId,
          unitId,
          lesson.code,
          lesson.position,
          lesson.pattern,
          lesson.title,
          lesson.description ?? "",
          lesson.estimated_minutes ?? null,
        ],
      );
      const lessonId = result.rows[0].id;
      lessonIds.set(lesson.code, lessonId);

      for (const [index, objectiveCode] of lesson.objective_codes.entries()) {
        const objectiveId = objectiveIds.get(objectiveCode);
        await client.query(
          `INSERT INTO lesson_learning_objectives (
              course_version_id, lesson_id, learning_objective_id, position, is_required
           )
           VALUES ($1, $2, $3, $4, TRUE)`,
          [courseVersionId, lessonId, objectiveId, index + 1],
        );
      }
    }
  }

  let vocabularyReferences = 0;
  let sentenceReferences = 0;

  for (const objective of data.objectives) {
    const objectiveId = objectiveIds.get(objective.code);

    for (const reference of objective.vocabulary ?? []) {
      const vocabularyId = await resolveVocabularyId(client, reference);
      await client.query(
        `INSERT INTO learning_objective_vocabulary (
            course_version_id, learning_objective_id, vocabulary_word_id, usage_mode, position
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [courseVersionId, objectiveId, vocabularyId, reference.usage_mode, reference.position],
      );
      vocabularyReferences += 1;
    }

    for (const reference of objective.sentences ?? []) {
      const sentenceId = await resolveSentenceId(client, reference);
      await client.query(
        `INSERT INTO learning_objective_sentences (
            course_version_id, learning_objective_id, context_sentence_id, usage_mode, position
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [courseVersionId, objectiveId, sentenceId, reference.usage_mode, reference.position],
      );
      sentenceReferences += 1;
    }
  }

  for (const unit of data.units) {
    for (const lesson of unit.lessons) {
      const lessonId = lessonIds.get(lesson.code);
      for (const prerequisite of lesson.prerequisites ?? []) {
        await client.query(
          `INSERT INTO lesson_prerequisites (
              course_version_id, lesson_id, prerequisite_lesson_id,
              required_state, minimum_mastery_score
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [
            courseVersionId,
            lessonId,
            lessonIds.get(prerequisite.lesson_code),
            prerequisite.required_state,
            prerequisite.minimum_mastery_score,
          ],
        );
      }
    }
  }

  await client.query(
    `INSERT INTO curriculum_content_package_imports (
        course_version_id, format, schema_version, package_sha256, metadata,
        content_schema_version_explicit
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      courseVersionId,
      data.format,
      data.schema_version,
      packageSha256,
      JSON.stringify(data.metadata),
      Object.hasOwn(data.version, "content_schema_version"),
    ],
  );

  return {
    state: "imported",
    courseVersionId,
    packageSha256,
    units: data.units.length,
    lessons: data.units.reduce((total, unit) => total + unit.lessons.length, 0),
    objectives: data.objectives.length,
    vocabularyReferences,
    sentenceReferences,
  };
}

/**
 * Import one already-validated package.
 *
 * The transaction is always rolled back unless apply=true. A dry run therefore
 * executes the same inserts, foreign keys, triggers, RLS policies and reference
 * resolution as a real import, but leaves no curriculum data behind.
 */
export async function importCurriculumPackage(pool, data, packageSha256, { apply = false, actorUserId } = {}) {
  if (typeof actorUserId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    throw new Error("actorUserId must be a valid UUID belonging to a registered content editor.");
  }
  if (!/^[0-9a-f]{64}$/.test(packageSha256)) {
    throw new Error("packageSha256 must be a lowercase 64-character SHA-256 hex digest.");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;

    // RLS verifies the transaction-local actor against public.content_editors.
    // The CLI is administrative and must never be exposed through an application endpoint.
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [actorUserId]);

    const result = await insertPackage(client, data, packageSha256);
    if (apply) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    transactionOpen = false;

    return {
      ...result,
      applied: apply && result.state === "imported",
      dryRun: !apply && result.state !== "already_imported",
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return 0;
  }

  let packagePathArg;
  let actorUserId;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--actor-user-id") {
      actorUserId = argv[index + 1];
      if (!actorUserId || actorUserId.startsWith("--")) {
        throw new Error("--actor-user-id requires a UUID.");
      }
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    } else if (!packagePathArg) {
      packagePathArg = arg;
    } else {
      throw new Error("Only one package path may be supplied.");
    }
  }

  if (!packagePathArg || !actorUserId) throw new Error(usage());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    throw new Error("--actor-user-id must be a valid UUID.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required; no default database credentials are used.");
  }

  const packagePath = path.resolve(process.cwd(), packagePathArg);
  const { data, packageSha256, validation } = await readValidatedPackage(packagePath);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  try {
    const result = await importCurriculumPackage(pool, data, packageSha256, { apply, actorUserId });
    console.log(JSON.stringify({
      valid: true,
      mode: apply ? "apply" : "dry-run",
      format: validation.format,
      schema_version: validation.schema_version,
      package_sha256: packageSha256,
      course: data.course.slug,
      cefr_level: data.version.cefr_level,
      version_number: data.version.version_number,
      ...result,
    }, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`Curriculum import failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
