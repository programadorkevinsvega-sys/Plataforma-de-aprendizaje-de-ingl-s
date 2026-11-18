#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
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
    "  node tools/curriculum/export_content_package.mjs --course <slug> --level <CEFR> --version <number> --actor-user-id <uuid> [--output <file>]",
    "",
    "Exports an imported curriculum version to the canonical JSON package format.",
    "The actor must be pre-registered in public.content_editors.",
    "The command is read-only and requires a trusted administrative DATABASE_URL.",
    "Without --output, the package is written to stdout.",
  ].join("\n");
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (!["--course", "--level", "--version", "--output", "--actor-user-id"].includes(option)) {
      throw new Error(`Unknown option: ${option}\n\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}\n\n${usage()}`);
    }
    if (values.has(option)) throw new Error(`Option ${option} was provided more than once.`);
    values.set(option, value);
    index += 1;
  }

  const course = values.get("--course");
  const level = values.get("--level");
  const versionText = values.get("--version");
  const actorUserId = values.get("--actor-user-id");
  if (!course || !level || !versionText || !actorUserId) throw new Error(usage());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    throw new Error("--actor-user-id must be a valid UUID.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course)) {
    throw new Error("--course must be a canonical lowercase slug.");
  }
  if (!["PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"].includes(level)) {
    throw new Error("--level must be a canonical CEFR code.");
  }
  if (!/^[1-9][0-9]*$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) {
    throw new Error("--version must be a positive safe integer.");
  }

  return {
    course,
    level,
    versionNumber: Number(versionText),
    output: values.get("--output"),
    actorUserId,
  };
}

function addOptional(target, key, value) {
  if (value !== null && value !== undefined) target[key] = value;
}

function validateExportedPackage(data, expectedSha256) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-curriculum-export-"));
  const packagePath = path.join(directory, "package.json");
  try {
    writeFileSync(packagePath, JSON.stringify(data), "utf8");
    const validation = spawnSync(process.env.PYTHON ?? "python3", [VALIDATOR, packagePath, "--json"], {
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
      throw new Error(`Curriculum validator returned invalid JSON: ${validation.stderr || validation.stdout}`);
    }
    if (validation.status !== 0 || result.valid !== true) {
      const errors = Array.isArray(result.errors) ? result.errors.join("\n") : "unknown validation error";
      throw new Error(`Exported relational content does not satisfy the canonical package contract:\n${errors}`);
    }
    if (result.sha256 !== expectedSha256) {
      throw new Error(
        `Export integrity check failed: stored SHA-256 ${expectedSha256}, reconstructed SHA-256 ${result.sha256}. The relational version may have drifted from its source package.`,
      );
    }
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function selectVersion(client, { course, level, versionNumber }) {
  const result = await client.query(
    `SELECT
        course.slug,
        course.track_code,
        version.version_number,
        version.status,
        version.cefr_level,
        version.title,
        version.description,
        version.locale,
        version.content_schema_version,
        imported.format,
        imported.schema_version,
        imported.package_sha256,
        imported.metadata,
        imported.content_schema_version_explicit
       FROM courses AS course
       JOIN course_versions AS version ON version.course_id = course.id
       JOIN curriculum_content_package_imports AS imported
         ON imported.course_version_id = version.id
      WHERE course.slug = $1
        AND version.cefr_level = $2
        AND version.version_number = $3`,
    [course, level, versionNumber],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `No imported curriculum package exists for ${course}/${level}/v${versionNumber}. Legacy or untracked versions cannot be exported as canonical packages.`,
    );
  }
  if (result.rowCount !== 1) {
    throw new Error("The requested course version is ambiguous; export aborted.");
  }
  return result.rows[0];
}

async function loadRelationalContent(client, version) {
  const unitsResult = await client.query(
    `SELECT id, unit_code, position, title, theme, description, estimated_minutes
       FROM course_units
      WHERE course_version_id = $1
      ORDER BY position, unit_code`,
    [version.id],
  );

  const lessonsResult = await client.query(
    `SELECT id, unit_id, lesson_code, position, lesson_pattern, title, description, estimated_minutes
       FROM course_lessons
      WHERE course_version_id = $1
      ORDER BY unit_id, position, lesson_code`,
    [version.id],
  );

  const objectivesResult = await client.query(
    `SELECT id, objective_code, position, description, success_criteria
       FROM learning_objectives
      WHERE course_version_id = $1
      ORDER BY position, objective_code`,
    [version.id],
  );

  const skillsResult = await client.query(
    `SELECT learning_objective_id, skill_code, is_primary
       FROM learning_objective_skills
      WHERE course_version_id = $1
      ORDER BY learning_objective_id, skill_code`,
    [version.id],
  );

  const objectiveLinksResult = await client.query(
    `SELECT lesson_id, learning_objective_id, position, is_required
       FROM lesson_learning_objectives
      WHERE course_version_id = $1
      ORDER BY lesson_id, position, learning_objective_id`,
    [version.id],
  );

  const prerequisitesResult = await client.query(
    `SELECT lesson_id, prerequisite_lesson_id, required_state, minimum_mastery_score
       FROM lesson_prerequisites
      WHERE course_version_id = $1
      ORDER BY lesson_id, prerequisite_lesson_id`,
    [version.id],
  );

  const vocabularyResult = await client.query(
    `SELECT
        reference.learning_objective_id,
        word.word,
        word.category,
        reference.usage_mode,
        reference.position
       FROM learning_objective_vocabulary AS reference
       JOIN vocabulary_words AS word ON word.id = reference.vocabulary_word_id
      WHERE reference.course_version_id = $1
      ORDER BY reference.learning_objective_id, reference.position, word.word`,
    [version.id],
  );

  const sentencesResult = await client.query(
    `SELECT
        reference.learning_objective_id,
        word.word,
        sentence.english_text,
        reference.usage_mode,
        reference.position
       FROM learning_objective_sentences AS reference
       JOIN context_sentences AS sentence ON sentence.id = reference.context_sentence_id
       JOIN vocabulary_words AS word ON word.id = sentence.word_id
      WHERE reference.course_version_id = $1
      ORDER BY reference.learning_objective_id, reference.position, word.word, sentence.english_text`,
    [version.id],
  );

  const unitsById = new Map();
  const lessonsById = new Map();
  const objectivesById = new Map();

  const units = unitsResult.rows.map((row) => {
    const unit = {
      code: row.unit_code,
      position: row.position,
      title: row.title,
      theme: row.theme,
      description: row.description,
      lessons: [],
    };
    addOptional(unit, "estimated_minutes", row.estimated_minutes);
    unitsById.set(row.id, unit);
    return unit;
  });

  for (const row of lessonsResult.rows) {
    const parent = unitsById.get(row.unit_id);
    if (!parent) throw new Error(`Lesson ${row.lesson_code} points to a unit outside its course version.`);
    const lesson = {
      code: row.lesson_code,
      position: row.position,
      pattern: row.lesson_pattern,
      title: row.title,
      description: row.description,
      objective_codes: [],
      prerequisites: [],
    };
    addOptional(lesson, "estimated_minutes", row.estimated_minutes);
    parent.lessons.push(lesson);
    lessonsById.set(row.id, lesson);
  }

  const objectives = objectivesResult.rows.map((row) => {
    const objective = {
      code: row.objective_code,
      position: row.position,
      description: row.description,
      success_criteria: row.success_criteria,
      skills: [],
      vocabulary: [],
      sentences: [],
    };
    objectivesById.set(row.id, objective);
    return objective;
  });

  for (const row of skillsResult.rows) {
    const objective = objectivesById.get(row.learning_objective_id);
    if (!objective) throw new Error("A skill points to an objective outside its course version.");
    objective.skills.push({ code: row.skill_code, is_primary: row.is_primary });
  }

  for (const row of objectiveLinksResult.rows) {
    const lesson = lessonsById.get(row.lesson_id);
    const objective = objectivesById.get(row.learning_objective_id);
    if (!lesson || !objective) throw new Error("A lesson-objective link crosses course versions.");
    if (row.is_required !== true) {
      throw new Error(
        "The canonical package v1 contract cannot represent optional lesson objectives; export aborted rather than losing is_required=false.",
      );
    }
    lesson.objective_codes.push(objective.code);
  }

  for (const row of prerequisitesResult.rows) {
    const lesson = lessonsById.get(row.lesson_id);
    const prerequisite = lessonsById.get(row.prerequisite_lesson_id);
    if (!lesson || !prerequisite) throw new Error("A lesson prerequisite crosses course versions.");
    lesson.prerequisites.push({
      lesson_code: prerequisite.code,
      required_state: row.required_state,
      minimum_mastery_score: Number(row.minimum_mastery_score),
    });
  }

  for (const row of vocabularyResult.rows) {
    const objective = objectivesById.get(row.learning_objective_id);
    if (!objective) throw new Error("A vocabulary reference points to an objective outside its version.");
    objective.vocabulary.push({
      word: row.word,
      category: row.category,
      usage_mode: row.usage_mode,
      position: row.position,
    });
  }

  for (const row of sentencesResult.rows) {
    const objective = objectivesById.get(row.learning_objective_id);
    if (!objective) throw new Error("A sentence reference points to an objective outside its version.");
    objective.sentences.push({
      word: row.word,
      english_text: row.english_text,
      usage_mode: row.usage_mode,
      position: row.position,
    });
  }

  // Skills and prerequisites have no position column in the relational model.
  // Their order is therefore canonicalized by code/name, not by insertion order.
  for (const objective of objectives) {
    objective.skills.sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));
  }
  for (const unit of units) {
    for (const lesson of unit.lessons) {
      lesson.prerequisites.sort((left, right) => (
        left.lesson_code < right.lesson_code ? -1 : left.lesson_code > right.lesson_code ? 1 : 0
      ));
    }
  }

  return { units, objectives };
}

export async function exportCurriculumPackage(pool, selector, { actorUserId } = {}) {
  if (typeof actorUserId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    throw new Error("actorUserId must be a valid UUID belonging to a registered content editor.");
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [actorUserId]);
    const authorization = await client.query("SELECT app_is_content_editor() AS allowed");
    if (authorization.rows[0]?.allowed !== true) {
      throw new Error("The selected actor is not registered as a curriculum content editor.");
    }

    const version = await selectVersion(client, selector);
    const relational = await loadRelationalContent(client, version);
    const data = {
      format: version.format,
      schema_version: version.schema_version,
      metadata: version.metadata,
      course: {
        slug: version.slug,
        track_code: version.track_code,
      },
      version: {
        version_number: version.version_number,
        cefr_level: version.cefr_level,
        title: version.title,
        description: version.description,
        locale: version.locale,
      },
      units: relational.units,
      objectives: relational.objectives,
    };

    if (version.content_schema_version_explicit) {
      data.version.content_schema_version = version.content_schema_version;
    }

    const validation = validateExportedPackage(data, version.package_sha256);
    await client.query("COMMIT");
    transactionOpen = false;

    return {
      data,
      packageSha256: validation.sha256,
      status: version.status,
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required; no default database credentials are used.");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  try {
    const { data, packageSha256, status } = await exportCurriculumPackage(pool, args, { actorUserId: args.actorUserId });
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    if (args.output) {
      const outputPath = path.resolve(process.cwd(), args.output);
      await writeFile(outputPath, serialized, { encoding: "utf8", flag: "wx" });
      process.stderr.write(
        `Exported ${args.course}/${args.level}/v${args.versionNumber} (${status}) to ${outputPath}; sha256=${packageSha256}\n`,
      );
    } else {
      process.stdout.write(serialized);
    }
    return 0;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`Curriculum export failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
