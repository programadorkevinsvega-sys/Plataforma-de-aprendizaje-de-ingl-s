#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { auditCatalog } from "./audit_lexical_catalog.mjs";
import { importLexicalCatalog } from "./import_lexical_catalog.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CATALOG = path.join(ROOT, "crates/content-vocabulary-service/data/lexical_catalog.v2.json");
const DEFAULT_RELEASE = path.join(ROOT, "tools/curriculum/initial-release-comprehension.v1.json");
const EXPECTED_RESOURCE_IDS = new Set([
  "general-pre_a1-reading-01",
  "general-pre_a1-listening-02",
  "general-a1-reading-03",
  "general-a1-listening-04",
]);

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
    if (!["--catalog", "--release", "--actor-user-id"].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
    if (values.has(option)) throw new Error(`Option ${option} was provided more than once`);
    values.set(option, value);
    index += 1;
  }
  return {
    help: false,
    catalogPath: path.resolve(values.get("--catalog") ?? DEFAULT_CATALOG),
    releasePath: path.resolve(values.get("--release") ?? DEFAULT_RELEASE),
    actorUserId: values.get("--actor-user-id") ?? null,
    apply,
  };
}

export function composeInitialReleaseCatalog(catalog, release) {
  if (catalog?.format !== "devfluency.lexical-catalog" || catalog.schema_version !== 2) {
    throw new Error("A canonical lexical catalog v2 is required.");
  }
  if (release?.format !== "devfluency.initial-comprehension-release" || release.schema_version !== 1) {
    throw new Error("Unsupported initial comprehension release format.");
  }
  if (!Array.isArray(release.resources) || release.resources.length !== EXPECTED_RESOURCE_IDS.size) {
    throw new Error(`The initial release must contain exactly ${EXPECTED_RESOURCE_IDS.size} comprehension resources.`);
  }

  const replacements = new Map();
  for (const resource of release.resources) {
    if (!EXPECTED_RESOURCE_IDS.has(resource.id) || replacements.has(resource.id)) {
      throw new Error(`Unexpected or duplicate comprehension resource id: ${resource.id}`);
    }
    if (resource.track !== "general" || !["PRE_A1", "A1"].includes(resource.cefr_level)) {
      throw new Error(`Initial release resource has an invalid route or level: ${resource.id}`);
    }
    if (!["reading", "listening"].includes(resource.skill)) {
      throw new Error(`Unsupported comprehension skill for resource: ${resource.id}`);
    }
    if (resource.publication_status !== "draft" || resource.editorial_status !== "pending_editorial_and_level_review") {
      throw new Error(`Initial comprehension resources must remain drafts pending editorial review: ${resource.id}`);
    }
    if (!Array.isArray(resource.questions) || resource.questions.length < 3) {
      throw new Error(`Each initial comprehension resource requires at least three questions: ${resource.id}`);
    }
    for (const question of resource.questions) {
      if (question.editorial_status !== "pending_human_review") {
        throw new Error(`Question review cannot be auto-approved: ${resource.id}/${question.id}`);
      }
      const options = Array.isArray(question.options) ? question.options : [];
      if (!options.some((option) => option.id === question.correct_option_id)) {
        throw new Error(`Invalid correct option for question: ${resource.id}/${question.id}`);
      }
      if (!resource.content.includes(question.evidence ?? "")) {
        throw new Error(`Question evidence must occur in the source: ${resource.id}/${question.id}`);
      }
    }
    if (resource.skill === "listening") {
      if (resource.transcript_available !== false) {
        throw new Error(`Listening transcript must remain hidden: ${resource.id}`);
      }
      if (resource.audio?.status !== "awaiting_tts_generation" || resource.audio.asset_url !== null) {
        throw new Error(`Listening audio must remain unpublished until a real asset is generated: ${resource.id}`);
      }
    }
    replacements.set(resource.id, resource);
  }
  if (replacements.size !== EXPECTED_RESOURCE_IDS.size) {
    throw new Error("Initial comprehension release is missing one or more required resource ids.");
  }

  const merged = structuredClone(catalog);
  const sourceResources = Array.isArray(merged.comprehension_resources) ? merged.comprehension_resources : [];
  const existingIds = new Set(sourceResources.map((resource) => resource.id));
  for (const id of replacements.keys()) {
    if (!existingIds.has(id)) throw new Error(`The canonical catalog does not contain resource ${id}.`);
  }
  merged.comprehension_resources = sourceResources.map((resource) => replacements.get(resource.id) ?? resource);

  const report = auditCatalog(merged);
  if (!report.valid) {
    const details = report.errors.map((error) => `${error.code} ${error.path}: ${error.message}`).join("\\n");
    throw new Error(`Merged catalog failed strict audit:\\n${details}`);
  }
  return merged;
}

function usage() {
  return [
    "Usage:",
    "  node tools/curriculum/import_initial_release_catalog.mjs --actor-user-id <uuid> [--apply]",
    "",
    "Imports the canonical 790-word v2 catalog and overlays the four original Pre-A1/A1 Reading/Listening resources.",
    "Default mode is a transactional database dry-run. --apply persists all imported content as drafts.",
    "No content is published by this command. Editorial approval and publication remain separate steps.",
    "The actor must be provisioned in public.content_editors and DATABASE_URL must be configured.",
  ].join("\\n");
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage() + "\\n");
    return 0;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (args.apply && !args.actorUserId) throw new Error("--actor-user-id is required with --apply.");

  const catalog = JSON.parse(readFileSync(args.catalogPath, "utf8"));
  const release = JSON.parse(readFileSync(args.releasePath, "utf8"));
  const merged = composeInitialReleaseCatalog(catalog, release);
  const mergedBytes = Buffer.from(JSON.stringify(merged, null, 2) + "\\n", "utf8");
  const contentSha256 = createHash("sha256").update(mergedBytes).digest("hex");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const result = await importLexicalCatalog(pool, merged, contentSha256, {
      apply: args.apply,
      actorUserId: args.actorUserId,
    });
    process.stdout.write(JSON.stringify({
      ...result,
      release_resources: release.resources.map((resource) => ({
        id: resource.id,
        skill: resource.skill,
        cefr_level: resource.cefr_level,
        publication_status: "draft",
        editorial_status: resource.editorial_status,
        audio_status: resource.audio?.status ?? "not_applicable",
      })),
    }, null, 2) + "\\n");
    return 0;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`Initial curriculum import failed: ${error.stack ?? error.message}\\n`);
      process.exitCode = 1;
    },
  );
}
