#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const ACTIONS = new Set(["submit", "review", "publish"]);
const DECISIONS = new Set(["approved", "rejected", "changes_requested"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usage() {
  return [
    "Usage:",
    "  node tools/curriculum/manage_course_version.mjs --action submit|review|publish --course <slug> --level <CEFR> --version <number> --actor-user-id <uuid> [--decision approved|rejected|changes_requested] [--comments <text>] [--apply]",
    "",
    "submit: move a draft version into editorial review.",
    "review: record an immutable decision by the registered editor.",
    "publish: publish only after the latest review is approved by the same editor.",
    "The default mode is dry-run; --apply is required to commit the transition.",
    "The actor must be provisioned in public.content_editors.",
  ].join("\n");
}

function parseArgs(argv) {
  const values = new Map();
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (option === "--apply") {
      apply = true;
      continue;
    }
    if (!["--action", "--course", "--level", "--version", "--actor-user-id", "--decision", "--comments"].includes(option)) {
      throw new Error(`Unknown option: ${option}\n\n${usage()}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${option}.\n\n${usage()}`);
    if (values.has(option)) throw new Error(`Option ${option} was provided more than once.`);
    values.set(option, value);
    index += 1;
  }

  const args = {
    action: values.get("--action"),
    course: values.get("--course"),
    level: values.get("--level"),
    versionNumber: Number(values.get("--version")),
    actorUserId: values.get("--actor-user-id"),
    decision: values.get("--decision"),
    comments: values.get("--comments") ?? "",
    apply,
  };

  if (!ACTIONS.has(args.action)) throw new Error("--action must be submit, review or publish.");
  if (!args.course || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.course)) {
    throw new Error("--course must be a canonical lowercase slug.");
  }
  if (!["PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"].includes(args.level)) {
    throw new Error("--level must be a canonical CEFR code.");
  }
  if (!/^[1-9][0-9]*$/.test(values.get("--version") ?? "") || !Number.isSafeInteger(args.versionNumber)) {
    throw new Error("--version must be a positive safe integer.");
  }
  if (!UUID_RE.test(args.actorUserId ?? "")) throw new Error("--actor-user-id must be a valid UUID.");
  if (args.action === "review" && !DECISIONS.has(args.decision)) {
    throw new Error("--decision must be approved, rejected or changes_requested for review.");
  }
  if (args.action !== "review" && (args.decision || values.has("--comments"))) {
    throw new Error("--decision and --comments are only valid with --action review.");
  }
  if (args.action === "review" && args.decision !== "approved" && !args.comments.trim()) {
    throw new Error("A non-approved review decision requires non-empty --comments.");
  }
  return args;
}

async function findVersion(client, selector) {
  const result = await client.query(
    `SELECT version.id, version.status, version.submitted_at
       FROM courses AS course
       JOIN course_versions AS version ON version.course_id = course.id
      WHERE course.slug = $1
        AND version.cefr_level = $2
        AND version.version_number = $3
      FOR UPDATE OF version`,
    [selector.course, selector.level, selector.versionNumber],
  );
  if (result.rowCount === 0) {
    throw new Error(`Course version not found: ${selector.course}/${selector.level}/v${selector.versionNumber}.`);
  }
  if (result.rowCount !== 1) throw new Error("The requested course version is ambiguous.");
  return result.rows[0];
}

/**
 * Apply one editorial transition inside a caller-owned transaction.
 * The caller must set app.current_user_id before invoking this function.
 */
export async function applyEditorialAction(client, args) {
  const version = await findVersion(client, args);

  if (args.action === "submit") {
    if (version.status !== "draft") {
      throw new Error(`Only a draft can be submitted for review; current status is "${version.status}".`);
    }
    await client.query(
      `UPDATE course_versions
          SET status = 'review',
              submitted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [version.id],
    );
    return { action: "submit", previousStatus: "draft", nextStatus: "review", courseVersionId: version.id };
  }

  if (args.action === "review") {
    if (version.status !== "review") {
      throw new Error(`A review decision requires status "review"; current status is "${version.status}".`);
    }
    const inserted = await client.query(
      `INSERT INTO course_version_reviews (course_version_id, reviewer_id, decision, comments)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reviewed_at`,
      [version.id, args.actorUserId, args.decision, args.comments],
    );

    let nextStatus = "review";
    if (args.decision !== "approved") {
      await client.query(
        `UPDATE course_versions
            SET status = 'draft',
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [version.id],
      );
      nextStatus = "draft";
    }
    return {
      action: "review",
      decision: args.decision,
      previousStatus: "review",
      nextStatus,
      courseVersionId: version.id,
      reviewId: inserted.rows[0].id,
      reviewedAt: inserted.rows[0].reviewed_at,
    };
  }

  if (args.action === "publish") {
    if (version.status !== "review") {
      throw new Error(`Only a version under review can be published; current status is "${version.status}".`);
    }
    const latestReview = await client.query(
      `SELECT reviewer_id, decision
         FROM course_version_reviews
        WHERE course_version_id = $1
        ORDER BY reviewed_at DESC, id DESC
        LIMIT 1`,
      [version.id],
    );
    if (
      latestReview.rowCount !== 1
      || latestReview.rows[0].decision !== "approved"
      || latestReview.rows[0].reviewer_id !== args.actorUserId
    ) {
      throw new Error("Publication requires the latest approved review to belong to the publishing editor.");
    }

    await client.query(
      `UPDATE course_versions
          SET status = 'published',
              reviewed_by = $2,
              published_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [version.id, args.actorUserId],
    );
    return { action: "publish", previousStatus: "review", nextStatus: "published", courseVersionId: version.id };
  }

  throw new Error("Unsupported editorial action.");
}

export async function manageCourseVersion(pool, args, { actorUserId, apply = false } = {}) {
  if (!UUID_RE.test(actorUserId ?? "")) {
    throw new Error("actorUserId must be a valid UUID belonging to a registered content editor.");
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [actorUserId]);
    const result = await applyEditorialAction(client, { ...args, actorUserId });
    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    transactionOpen = false;
    return { ...result, applied: apply, dryRun: !apply };
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
    const result = await manageCourseVersion(pool, args, {
      actorUserId: args.actorUserId,
      apply: args.apply,
    });
    console.log(JSON.stringify({
      mode: args.apply ? "apply" : "dry-run",
      course: args.course,
      level: args.level,
      version_number: args.versionNumber,
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
      console.error(`Curriculum editorial action failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
