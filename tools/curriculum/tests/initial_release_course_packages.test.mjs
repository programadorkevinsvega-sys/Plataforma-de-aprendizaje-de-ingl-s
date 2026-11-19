import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CATALOG = path.join(ROOT, "crates/content-vocabulary-service/data/lexical_catalog.v2.json");
const VALIDATOR = path.join(ROOT, "tools/curriculum/validate_content_package.py");
const PACKAGES = [
  {
    file: "tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json",
    level: "PRE_A1",
    units: 3,
    lessons: 5,
    objectives: 5,
  },
  {
    file: "tests/fixtures/curriculum/initial-release-english-general-a1-v1.json",
    level: "A1",
    units: 3,
    lessons: 5,
    objectives: 5,
  },
];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

test("initial English General course packages pass the strict package validator", () => {
  for (const entry of PACKAGES) {
    const packagePath = path.join(ROOT, entry.file);
    const result = spawnSync("python3", [VALIDATOR, packagePath, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.valid, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.status_on_future_import, "draft");
    assert.equal(report.units, entry.units);
    assert.equal(report.lessons, entry.lessons);
    assert.equal(report.objectives, entry.objectives);
  }
});

test("every course vocabulary and sentence reference resolves to exactly one canonical item at its CEFR level", () => {
  const catalog = readJson(CATALOG);
  for (const entry of PACKAGES) {
    const data = readJson(path.join(ROOT, entry.file));
    assert.equal(data.course.slug, "english-general");
    assert.equal(data.course.track_code, "general");
    assert.equal(data.version.cefr_level, entry.level);
    assert.equal(data.version.content_schema_version, 2);

    for (const objective of data.objectives) {
      const vocabularyReferences = objective.vocabulary ?? [];
      for (const reference of vocabularyReferences) {
        const matches = catalog.lexical_items.filter((item) =>
          item.cefr_level === entry.level
          && item.tracks.includes("general")
          && item.lexical_form.toLowerCase() === reference.word.toLowerCase()
          && item.category_id === reference.category
        );
        assert.equal(
          matches.length,
          1,
          `Expected one canonical ${entry.level} item for ${reference.word}/${reference.category}; found ${matches.length}`,
        );
      }

      for (const reference of objective.sentences ?? []) {
        assert.ok(
          vocabularyReferences.some((item) => item.word.toLowerCase() === reference.word.toLowerCase()),
          `Sentence reference must belong to a vocabulary reference in objective ${objective.code}: ${reference.word}`,
        );
        const matches = catalog.lexical_items.filter((item) =>
          item.cefr_level === entry.level
          && item.tracks.includes("general")
          && item.lexical_form.toLowerCase() === reference.word.toLowerCase()
          && (item.examples ?? []).some((example) =>
            example.english_text.toLowerCase() === reference.english_text.toLowerCase()
          )
        );
        assert.equal(
          matches.length,
          1,
          `Expected one canonical ${entry.level} example for ${reference.word}: ${reference.english_text}; found ${matches.length}`,
        );
      }
    }
  }
});

test("initial course packages contain linked, ordered units, lessons and measurable objectives", () => {
  for (const entry of PACKAGES) {
    const data = readJson(path.join(ROOT, entry.file));
    const objectiveCodes = new Set(data.objectives.map((objective) => objective.code));
    const units = [...data.units].sort((left, right) => left.position - right.position);
    assert.deepEqual(units.map((unit) => unit.position), [1, 2, 3]);

    for (const unit of units) {
      const lessons = [...unit.lessons].sort((left, right) => left.position - right.position);
      assert.ok(lessons.length > 0, `Unit ${unit.code} must contain lessons`);
      for (const lesson of lessons) {
        assert.ok(lesson.objective_codes.length > 0);
        assert.ok(lesson.objective_codes.every((code) => objectiveCodes.has(code)));
      }
    }
    for (const objective of data.objectives) {
      assert.ok(objective.description.length > 0);
      assert.ok(objective.success_criteria.length > 0);
      assert.equal(objective.skills.filter((skill) => skill.is_primary).length, 1);
    }
  }
});
