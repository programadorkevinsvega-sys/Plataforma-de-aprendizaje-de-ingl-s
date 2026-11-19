import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auditCatalog, auditCatalogFile, DEFAULT_CATALOG_PATH } from '../audit_lexical_catalog.mjs';

const fixturePath = path.resolve('crates/content-vocabulary-service/data/lexical_catalog.v2.json');
const readCatalog = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

test('el catálogo unificado supera la auditoría estricta', () => {
  const report = auditCatalogFile(DEFAULT_CATALOG_PATH);
  assert.equal(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.summary.categories, 26);
  assert.equal(report.summary.lexical_items, 790);
  assert.equal(report.summary.comprehension_resources, 26);
  assert.equal(report.summary.reading_resources, 13);
  assert.equal(report.summary.listening_resources, 13);
  assert.equal(report.summary.examples, 2201);
  assert.equal(report.summary.pending_editorial_review, 790);
  assert.equal(report.summary.pending_frequency_match, 709);
  assert.equal(report.summary.level_counts.PRE_A1, 237);
  assert.equal(report.summary.level_counts.A1, 484);
  assert.ok(report.summary.shared_example_warnings >= 0);
});

test('la taxonomía publicada en el catálogo coincide con la fuente canónica compartida', () => {
  const catalog = readCatalog();
  const taxonomyPath = path.resolve('tools/curriculum/lexical-taxonomy.v1.json');
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  assert.deepEqual(catalog.categories, taxonomy.categories);
});

test('los ejemplos compartidos se reportan para revisión, no se eliminan automáticamente', () => {
  const catalog = readCatalog();
  const shared = catalog.lexical_items[0].examples[0].english_text;
  catalog.lexical_items[1].examples[0].english_text = shared;
  const report = auditCatalog(catalog);
  assert.equal(report.valid, true);
  assert.ok(report.warnings.some(warning => warning.code === 'SHARED_EXAMPLE_ACROSS_ITEMS'));
});

test('no admite claves de categoría heredadas ni nivel A0', () => {
  const catalog = readCatalog();
  const item = catalog.lexical_items[0];
  item.category_id = 'animals_basic';
  assert.ok(auditCatalog(catalog).errors.some(error => error.code === 'UNKNOWN_CATEGORY'));
  const fresh = readCatalog();
  fresh.lexical_items[0].cefr_level = 'A0';
  assert.ok(auditCatalog(fresh).errors.some(error => error.code === 'INVALID_LEVEL'));
});

test('no admite frecuencias numéricas sin unión validada con el corpus', () => {
  const catalog = readCatalog();
  catalog.lexical_items[0].frequency.general_rank = 7;
  const report = auditCatalog(catalog);
  assert.ok(report.errors.some(error => error.code === 'UNVERIFIED_FREQUENCY_RANK'));
});

test('una pronunciación aprobada exige guías lenta y natural verificadas', () => {
  const catalog = readCatalog();
  catalog.lexical_items[0].pronunciation.status = 'approved';
  const report = auditCatalog(catalog);
  assert.ok(report.errors.some(error => error.code === 'APPROVED_PRONUNCIATION_INCOMPLETE'));
});

test('no permite publicar escucha sin audio real aprobado', () => {
  const catalog = readCatalog();
  const listening = catalog.comprehension_resources.find(resource => resource.skill === 'listening');
  listening.publication_status = 'published';
  listening.audio = { asset_url: null, status: 'not_generated' };
  const report = auditCatalog(catalog);
  assert.ok(report.errors.some(error => error.code === 'LISTENING_WITHOUT_APPROVED_AUDIO'));
});

test('rechaza identidad léxica duplicada en el mismo nivel, categoría y sentido', () => {
  const catalog = readCatalog();
  catalog.lexical_items[1] = {
    ...catalog.lexical_items[0],
    id: 'another-id',
  };
  const report = auditCatalog(catalog);
  assert.ok(report.errors.some(error => error.code === 'DUPLICATE_LEXICAL_IDENTITY'));
});

test('un rango de frecuencia nunca puede existir sin evidencia reproducible', () => {
  const catalog = readCatalog();
  const item = catalog.lexical_items.find(entry => entry.frequency.validation_status === 'pending_corpus_match');
  item.frequency.general_rank = 12;
  item.frequency.validation_status = 'matched_both_modified_lemma_lists';
  const report = auditCatalog(catalog);
  assert.ok(report.errors.some(error => error.code === 'FREQUENCY_RANK_WITHOUT_PROVENANCE'));
});

test('las expresiones multi-palabra no se fuerzan dentro de listas de frecuencia unigrama', () => {
  const catalog = readCatalog();
  const item = catalog.lexical_items.find(entry => entry.lexical_type === 'collocation');
  item.frequency.validation_status = 'not_applicable_multiword';
  assert.equal(auditCatalog(catalog).errors.length, 0);
});
