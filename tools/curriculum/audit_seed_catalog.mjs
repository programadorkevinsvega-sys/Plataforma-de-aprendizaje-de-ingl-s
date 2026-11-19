import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CATALOGS = [
  { id: "A0", path: "crates/content-vocabulary-service/data/seed_lessons_a0.json", expectedLevel: "A0" },
  { id: "A1", path: "crates/content-vocabulary-service/data/seed_lessons_a1.json", expectedLevel: "A1" },
  { id: "legacy", path: "crates/content-vocabulary-service/data/seed_lessons.json", expectedLevel: null },
];

const ROOT_KEYS = [
  "category", "level", "word", "spanish_phonetic", "spanish_translation",
  "context_sentences", "spanish_phonetic_natural",
].sort();
const SENTENCE_KEYS = [
  "english_text", "spanish_phonetic", "spanish_translation", "spanish_phonetic_natural",
].sort();

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, items }));
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function recordSignature(row) {
  return JSON.stringify({
    category: row.category,
    level: row.level,
    word: row.word?.trim().toLowerCase(),
    spanish_phonetic: row.spanish_phonetic?.toLowerCase(),
    spanish_translation: row.spanish_translation,
    spanish_phonetic_natural: row.spanish_phonetic_natural?.toLowerCase(),
    context_sentences: (row.context_sentences ?? []).map((sentence) => ({
      english_text: sentence.english_text,
      spanish_phonetic: sentence.spanish_phonetic?.toLowerCase(),
      spanish_translation: sentence.spanish_translation,
      spanish_phonetic_natural: sentence.spanish_phonetic_natural?.toLowerCase(),
    })),
  });
}

export function auditRows(rows, { file = "unknown", expectedLevel = null } = {}) {
  const errors = [];
  const phoneticCaseIssues = [];
  const phoneticPairs = [];
  const sentenceOccurrences = [];
  const translations = [];
  const categories = new Map();
  const words = new Map();
  const exactRecords = new Map();

  if (!Array.isArray(rows)) {
    return {
      file,
      errors: [file + ": la raíz debe ser un array JSON"],
      summary: {
        records: 0, unique_headwords: 0, exact_duplicate_records: 0,
        duplicate_headword_groups: 0, repeated_sentence_groups: 0,
        duplicate_translation_groups: 0, category_count: 0,
        phonetic_values: 0, phonetic_case_issues: 0,
        different_slow_natural_pairs: 0,
      },
      duplicate_headwords: [],
      duplicate_sentence_groups: [],
      duplicate_translation_groups: [],
      category_counts: {},
      phonetic_case_issue_details: [],
    };
  }

  rows.forEach((row, index) => {
    const path = file + "[" + index + "]";
    if (!hasExactKeys(row, ROOT_KEYS)) {
      errors.push(path + ": las claves raíz deben ser exactamente " + ROOT_KEYS.join(", "));
    }

    for (const field of [
      "category", "level", "word", "spanish_phonetic",
      "spanish_translation", "spanish_phonetic_natural",
    ]) {
      if (!nonEmptyString(row?.[field])) {
        errors.push(path + "." + field + ": debe ser texto no vacío");
      }
    }

    if (expectedLevel && row?.level !== expectedLevel) {
      errors.push(path + ".level: se esperaba " + expectedLevel + " y se encontró " + String(row?.level));
    }

    if (!Array.isArray(row?.context_sentences) || row.context_sentences.length !== 3) {
      errors.push(path + ".context_sentences: debe contener exactamente 3 elementos");
    }

    for (const field of ["spanish_phonetic", "spanish_phonetic_natural"]) {
      const value = row?.[field];
      if (typeof value === "string" && value !== value.toLowerCase()) {
        phoneticCaseIssues.push({ path: path + "." + field, value });
      }
    }
    if (typeof row?.spanish_phonetic === "string" &&
        typeof row?.spanish_phonetic_natural === "string") {
      phoneticPairs.push({
        word: row.word,
        slow: row.spanish_phonetic,
        natural: row.spanish_phonetic_natural,
      });
    }

    const sentenceRows = Array.isArray(row?.context_sentences) ? row.context_sentences : [];
    sentenceRows.forEach((sentence, sentenceIndex) => {
      const sentencePath = path + ".context_sentences[" + sentenceIndex + "]";
      if (!hasExactKeys(sentence, SENTENCE_KEYS)) {
        errors.push(sentencePath + ": las claves deben ser exactamente " + SENTENCE_KEYS.join(", "));
      }
      for (const field of SENTENCE_KEYS) {
        if (!nonEmptyString(sentence?.[field])) {
          errors.push(sentencePath + "." + field + ": debe ser texto no vacío");
        }
      }
      for (const field of ["spanish_phonetic", "spanish_phonetic_natural"]) {
        const value = sentence?.[field];
        if (typeof value === "string" && value !== value.toLowerCase()) {
          phoneticCaseIssues.push({ path: sentencePath + "." + field, value });
        }
      }
      if (typeof sentence?.spanish_phonetic === "string" &&
          typeof sentence?.spanish_phonetic_natural === "string") {
        phoneticPairs.push({
          word: row.word,
          slow: sentence.spanish_phonetic,
          natural: sentence.spanish_phonetic_natural,
        });
      }
      if (nonEmptyString(sentence?.english_text)) {
        sentenceOccurrences.push({
          english_text: sentence.english_text.trim(),
          word: row.word,
          category: row.category,
        });
      }
    });

    if (nonEmptyString(row?.category)) {
      categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
    }
    if (nonEmptyString(row?.spanish_translation)) {
      translations.push({
        translation: row.spanish_translation.trim(),
        word: row.word,
        category: row.category,
      });
    }
    if (nonEmptyString(row?.word)) {
      const wordKey = row.word.trim().toLowerCase();
      if (!words.has(wordKey)) words.set(wordKey, []);
      words.get(wordKey).push(row);
      const signature = recordSignature(row);
      if (!exactRecords.has(signature)) exactRecords.set(signature, []);
      exactRecords.get(signature).push(row);
    }
  });

  const duplicateHeadwords = [...words.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([headword, items]) => ({
      headword,
      occurrences: items.length,
      senses: [...new Map(items.map((item) => [
        item.category + "\u0000" + item.spanish_translation,
        { category: item.category, translation: item.spanish_translation },
      ])).values()],
      distinct_pronunciation_variants: new Set(items.map((item) =>
        item.spanish_phonetic + "\u0000" + item.spanish_phonetic_natural)).size,
    }));

  const duplicateSentenceGroups = groupBy(
    sentenceOccurrences,
    (item) => item.english_text.toLowerCase(),
  ).map(({ key, items }) => ({
    english_text: key,
    occurrences: items.length,
    words: [...new Set(items.map((item) => item.word))],
    categories: [...new Set(items.map((item) => item.category))],
  }));

  const duplicateTranslationGroups = groupBy(
    translations,
    (item) => item.translation.toLowerCase(),
  ).map(({ key, items }) => ({
    translation: key,
    occurrences: items.length,
    words: [...new Set(items.map((item) => item.word))],
  }));

  const duplicateRecordCount = [...exactRecords.values()]
    .reduce((total, items) => total + items.length - 1, 0);
  const categoryCounts = Object.fromEntries(
    [...categories.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const differentSlowNaturalPairs = phoneticPairs.filter(
    (pair) => pair.slow !== pair.natural,
  ).length;

  return {
    file,
    errors,
    summary: {
      records: rows.length,
      unique_headwords: words.size,
      exact_duplicate_records: duplicateRecordCount,
      duplicate_headword_groups: duplicateHeadwords.length,
      repeated_sentence_groups: duplicateSentenceGroups.length,
      duplicate_translation_groups: duplicateTranslationGroups.length,
      category_count: categories.size,
      phonetic_values: phoneticPairs.length * 2,
      phonetic_case_issues: phoneticCaseIssues.length,
      different_slow_natural_pairs: differentSlowNaturalPairs,
    },
    duplicate_headwords: duplicateHeadwords,
    duplicate_sentence_groups: duplicateSentenceGroups,
    duplicate_translation_groups: duplicateTranslationGroups,
    category_counts: categoryCounts,
    phonetic_case_issue_details: phoneticCaseIssues,
  };
}

export async function auditSeedCatalog({ root = process.cwd(), catalogs = DEFAULT_CATALOGS } = {}) {
  const results = [];
  const loaded = [];
  for (const catalog of catalogs) {
    const fullPath = resolve(root, catalog.path);
    const source = await readFile(fullPath, "utf8");
    const rows = JSON.parse(source);
    loaded.push(rows);
    results.push(auditRows(rows, {
      file: catalog.path,
      expectedLevel: catalog.expectedLevel,
    }));
  }

  const overlaps = [];
  for (let left = 0; left < results.length; left += 1) {
    const leftWords = new Set(loaded[left].map((row) => row.word.trim().toLowerCase()));
    for (let right = left + 1; right < results.length; right += 1) {
      const rightWords = new Set(loaded[right].map((row) => row.word.trim().toLowerCase()));
      const words = [...leftWords].filter((word) => rightWords.has(word)).sort();
      if (words.length > 0) {
        overlaps.push({
          catalogs: [catalogs[left].id, catalogs[right].id],
          shared_headwords: words,
        });
      }
    }
  }

  return { catalogs: results, cross_catalog_headword_overlaps: overlaps };
}

function printSummary(report) {
  const summary = report.catalogs.map(({ file, errors, summary: value }) => ({
    file,
    records: value.records,
    unique_headwords: value.unique_headwords,
    exact_duplicate_records: value.exact_duplicate_records,
    duplicate_headword_groups: value.duplicate_headword_groups,
    repeated_sentence_groups: value.repeated_sentence_groups,
    duplicate_translation_groups: value.duplicate_translation_groups,
    category_count: value.category_count,
    phonetic_values: value.phonetic_values,
    phonetic_case_issues: value.phonetic_case_issues,
    different_slow_natural_pairs: value.different_slow_natural_pairs,
    structural_errors: errors.length,
  }));
  process.stdout.write(JSON.stringify({
    catalogs: summary,
    cross_catalog_headword_overlaps: report.cross_catalog_headword_overlaps,
  }, null, 2) + "\n");
}

const isDirectExecution = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    const report = await auditSeedCatalog();
    if (process.argv.includes("--json")) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      printSummary(report);
    }
    if (process.argv.includes("--strict")) {
      const invalid = report.catalogs.some(({ errors, summary }) =>
        errors.length > 0 ||
        summary.exact_duplicate_records > 0 ||
        summary.phonetic_case_issues > 0);
      if (invalid) process.exitCode = 1;
    }
  } catch (error) {
    console.error("No fue posible auditar el catálogo: " + error.message);
    process.exitCode = 1;
  }
}
