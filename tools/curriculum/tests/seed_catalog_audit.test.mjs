import assert from "node:assert/strict";
import test from "node:test";

import { auditRows, auditSeedCatalog } from "../audit_seed_catalog.mjs";

test("el catálogo semilla actual cumple el esquema y no contiene duplicados exactos", async () => {
  const report = await auditSeedCatalog();
  const a0 = report.catalogs.find((catalog) => catalog.file.endsWith("seed_lessons_a0.json"));
  const a1 = report.catalogs.find((catalog) => catalog.file.endsWith("seed_lessons_a1.json"));
  const legacy = report.catalogs.find((catalog) => catalog.file.endsWith("seed_lessons.json"));

  assert.ok(a0);
  assert.ok(a1);
  assert.ok(legacy);

  for (const catalog of report.catalogs) {
    assert.deepEqual(catalog.errors, [], catalog.file + ": " + catalog.errors.join("; "));
    assert.equal(catalog.summary.exact_duplicate_records, 0, catalog.file);
    assert.equal(catalog.summary.phonetic_case_issues, 0, catalog.file);
  }

  assert.equal(a0.summary.records, 237);
  assert.equal(a0.summary.unique_headwords, 227);
  assert.equal(a1.summary.records, 469);
  assert.equal(a1.summary.unique_headwords, 469);
  assert.equal(legacy.summary.records, 8);
});

test("conserva sentidos distintos de un mismo lema y señala variantes para revisión", async () => {
  const report = await auditSeedCatalog();
  const a0 = report.catalogs.find((catalog) => catalog.file.endsWith("seed_lessons_a0.json"));
  const clean = a0.duplicate_headwords.find((entry) => entry.headword === "clean");
  const walk = a0.duplicate_headwords.find((entry) => entry.headword === "walk");

  assert.ok(clean);
  assert.deepEqual(
    clean.senses.map((sense) => sense.translation).sort(),
    ["limpiar", "limpio"],
  );
  assert.ok(walk);
  assert.equal(walk.distinct_pronunciation_variants, 2);
});

test("una frase reutilizada en dos palabras se reporta, no se elimina como registro duplicado", () => {
  const sharedSentence = (word, translation) => ({
    category: "basics",
    level: "A0",
    word,
    spanish_phonetic: word,
    spanish_translation: translation,
    spanish_phonetic_natural: word,
    context_sentences: [
      {
        english_text: "I see it.",
        spanish_phonetic: "ai sí it.",
        spanish_translation: "Lo veo.",
        spanish_phonetic_natural: "ai sí it.",
      },
      {
        english_text: "This is new.",
        spanish_phonetic: "dis iz niú.",
        spanish_translation: "Esto es nuevo.",
        spanish_phonetic_natural: "dis iz niú.",
      },
      {
        english_text: "It is here.",
        spanish_phonetic: "it iz jir.",
        spanish_translation: "Está aquí.",
        spanish_phonetic_natural: "it iz jir.",
      },
    ],
  });

  const rows = [
    sharedSentence("see", "ver"),
    sharedSentence("look", "mirar"),
  ];
  const before = JSON.stringify(rows);
  const report = auditRows(rows, { file: "fixture" });

  assert.equal(report.summary.exact_duplicate_records, 0);
  assert.equal(report.summary.repeated_sentence_groups, 3);
  assert.equal(JSON.stringify(rows), before, "la auditoría debe ser de solo lectura");
});
