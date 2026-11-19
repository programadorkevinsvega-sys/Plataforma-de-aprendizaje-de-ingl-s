import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { composeInitialReleaseCatalog } from "../import_initial_release_catalog.mjs";
import { auditCatalog } from "../audit_lexical_catalog.mjs";

const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "../../..");
const CATALOG = path.join(ROOT, "crates/content-vocabulary-service/data/lexical_catalog.v2.json");
const RELEASE = path.join(ROOT, "tools/curriculum/initial-release-comprehension.v1.json");

test("initial Pre-A1/A1 comprehension release passes the canonical catalog audit and remains unpublished", () => {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const release = JSON.parse(readFileSync(RELEASE, "utf8"));
  const merged = composeInitialReleaseCatalog(catalog, release);
  const report = auditCatalog(merged);

  assert.equal(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.equal(release.resources.length, 4);
  assert.equal(report.summary.lexical_items, 790);
  assert.equal(report.summary.examples, 2201);
  assert.equal(report.summary.comprehension_questions, 56);
  assert.equal(report.summary.pending_question_review, 56);

  for (const id of [
    "general-pre_a1-reading-01",
    "general-pre_a1-listening-02",
    "general-a1-reading-03",
    "general-a1-listening-04",
  ]) {
    const resource = merged.comprehension_resources.find((item) => item.id === id);
    assert.ok(resource, `Missing initial comprehension resource ${id}`);
    assert.equal(resource.publication_status, "draft");
    assert.equal(resource.editorial_status, "pending_editorial_and_level_review");
    assert.equal(resource.questions.length, 3);
    assert.ok(resource.questions.every((question) => question.editorial_status === "pending_human_review"));
  }

  for (const resource of merged.comprehension_resources.filter((item) => item.skill === "listening" && [
    "general-pre_a1-listening-02",
    "general-a1-listening-04",
  ].includes(item.id))) {
    assert.equal(resource.transcript_available, false);
    assert.equal(resource.audio.status, "awaiting_tts_generation");
    assert.equal(resource.audio.asset_url, null);
  }
});

test("initial release overlay rejects answer keys or editorial states that bypass human review", () => {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const release = JSON.parse(readFileSync(RELEASE, "utf8"));
  const badQuestion = structuredClone(release);
  badQuestion.resources[0].questions[0].editorial_status = "approved";
  assert.throws(() => composeInitialReleaseCatalog(catalog, badQuestion), /cannot be auto-approved/);

  const missingAudio = structuredClone(release);
  missingAudio.resources.find((resource) => resource.skill === "listening").audio.status = "approved";
  assert.throws(() => composeInitialReleaseCatalog(catalog, missingAudio), /must remain unpublished/);
});
