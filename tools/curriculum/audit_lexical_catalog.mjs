import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CATALOG_PATH = path.resolve(
  'crates/content-vocabulary-service/data/lexical_catalog.v2.json',
);

const LEVELS = new Set(['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const TRACKS = new Set(['general', 'technology']);
const LEXICAL_TYPES = new Set([
  'word', 'multiword_expression', 'fixed_expression', 'sentence_frame',
  'collocation', 'time_expression', 'phrasal_verb', 'discourse_marker',
  'technical_word', 'technical_term',
]);
const PRIORITIES = new Set([
  'core', 'high_utility', 'contextual', 'domain_core', 'high',
  'advanced', 'advanced_specialized',
]);
const FREQUENCY_BANDS = new Set(['not_verified', 'very_high', 'high', 'medium', 'low']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function wordCount(value) {
  return (value.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) || []).length;
}
function issue(errors, code, path, message) {
  errors.push({ code, path, message });
}

export function auditCatalog(catalog) {
  const errors = [];
  const warnings = [];
  const sharedExamples = new Map();
  const repeatedTranslations = new Map();
  const levelCounts = {};
  const trackCounts = {};
  const lexicalTypeCounts = {};
  let exampleCount = 0;
  if (!isObject(catalog)) {
    return { valid: false, errors: [{ code: 'CATALOG_NOT_OBJECT', path: '$', message: 'El catálogo debe ser un objeto JSON.' }], warnings, summary: null };
  }
  if (catalog.format !== 'devfluency.lexical-catalog' || catalog.schema_version !== 2) {
    issue(errors, 'INVALID_FORMAT', '$.format', 'Se requiere devfluency.lexical-catalog schema_version 2.');
  }
  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
  const categoryIds = new Set();
  for (const [index, category] of categories.entries()) {
    const p = '$.categories[' + index + ']';
    if (!isObject(category) || !/^[a-z][a-z0-9_]*$/.test(category.id || '')) {
      issue(errors, 'INVALID_CATEGORY', p, 'Cada categoría requiere un id snake_case.');
      continue;
    }
    if (categoryIds.has(category.id)) issue(errors, 'DUPLICATE_CATEGORY', p + '.id', 'El id de categoría está repetido.');
    categoryIds.add(category.id);
    if (!nonEmpty(category.label_es) || !nonEmpty(category.label_en) || !nonEmpty(category.description)) {
      issue(errors, 'INCOMPLETE_CATEGORY', p, 'La categoría requiere etiquetas en ambos idiomas y descripción.');
    }
  }
  const items = Array.isArray(catalog.lexical_items) ? catalog.lexical_items : [];
  const ids = new Set();
  const identities = new Set();
  let draftCount = 0;
  let pendingPronunciation = 0;
  let pendingEditorial = 0;
  let pendingFrequency = 0;
  for (const [index, item] of items.entries()) {
    const p = '$.lexical_items[' + index + ']';
    if (!isObject(item)) {
      issue(errors, 'INVALID_ITEM', p, 'La unidad léxica debe ser un objeto.');
      continue;
    }
    if (!nonEmpty(item.id) || ids.has(item.id)) issue(errors, 'DUPLICATE_OR_MISSING_ID', p + '.id', 'Cada unidad requiere un id único.');
    ids.add(item.id);
    if (!nonEmpty(item.lexical_form)) issue(errors, 'MISSING_LEXICAL_FORM', p + '.lexical_form', 'Falta la forma léxica.');
    levelCounts[item.cefr_level] = (levelCounts[item.cefr_level] || 0) + 1;
    lexicalTypeCounts[item.lexical_type] = (lexicalTypeCounts[item.lexical_type] || 0) + 1;
    for (const track of Array.isArray(item.tracks) ? item.tracks : []) {
      const key = track + '|' + item.cefr_level;
      trackCounts[key] = (trackCounts[key] || 0) + 1;
    }
    const translationKey = (item.meaning_es || '').trim().toLocaleLowerCase('es');
    if (translationKey) {
      const translated = repeatedTranslations.get(translationKey) || [];
      translated.push({ id: item.id, lexical_form: item.lexical_form });
      repeatedTranslations.set(translationKey, translated);
    }
    if (!LEXICAL_TYPES.has(item.lexical_type)) issue(errors, 'INVALID_LEXICAL_TYPE', p + '.lexical_type', 'Tipo léxico no reconocido.');
    if (!nonEmpty(item.meaning_es)) issue(errors, 'MISSING_MEANING', p + '.meaning_es', 'Falta el significado en español.');
    if (!categoryIds.has(item.category_id)) issue(errors, 'UNKNOWN_CATEGORY', p + '.category_id', 'La categoría no pertenece a la taxonomía v1.');
    if (!LEVELS.has(item.cefr_level)) issue(errors, 'INVALID_LEVEL', p + '.cefr_level', 'Nivel no canónico; use PRE_A1 o A1–C2.');
    if (!Array.isArray(item.tracks) || item.tracks.length === 0 || item.tracks.some(track => !TRACKS.has(track))) {
      issue(errors, 'INVALID_TRACK', p + '.tracks', 'Se requiere al menos una ruta conocida.');
    }
    if (!PRIORITIES.has(item.editorial_priority)) issue(errors, 'INVALID_PRIORITY', p + '.editorial_priority', 'Prioridad editorial no reconocida.');
    if (!isObject(item.frequency) || !FREQUENCY_BANDS.has(item.frequency.band)) {
      issue(errors, 'INVALID_FREQUENCY', p + '.frequency', 'La clasificación de frecuencia debe usar una banda válida.');
    } else {
      for (const [field, evidenceField] of [
        ['general_rank', 'general_evidence'],
        ['spoken_rank', 'spoken_evidence'],
      ]) {
        const value = item.frequency[field];
        const evidence = item.frequency[evidenceField];
        if (value !== null && (!Number.isInteger(value) || value < 1)) {
          issue(errors, 'INVALID_FREQUENCY_RANK', p + '.frequency.' + field, 'El rango debe ser entero positivo o null.');
        }
        if (item.frequency.validation_status === 'pending_corpus_match' && value !== null) {
          issue(errors, 'UNVERIFIED_FREQUENCY_RANK', p + '.frequency.' + field, 'No se acepta un rango sin cruce verificado de lema.');
        }
        if (value !== null && (
          !isObject(evidence)
          || evidence.rank !== value
          || !nonEmpty(evidence.source_id)
          || !nonEmpty(evidence.source_url)
          || !/^[a-f0-9]{64}$/i.test(evidence.source_sha256 || '')
          || evidence.match_method !== 'exact_modified_lemma'
        )) {
          issue(errors, 'FREQUENCY_RANK_WITHOUT_PROVENANCE', p + '.frequency.' + field, 'Cada rango requiere evidencia exacta del corpus, URL, metodología y SHA-256.');
        }
        if (item.frequency.validation_status === 'not_applicable_multiword' && value !== null) {
          issue(errors, 'MULTIWORD_FREQUENCY_RANK', p + '.frequency.' + field, 'No se asignan rangos unigramas a expresiones multi-palabra.');
        }
      }
      if (item.frequency.validation_status === 'verified_against_both_modified_lemma_lists') {
        for (const source of ['general', 'spoken']) {
          const matchStatus = item.frequency[`${source}_match_status`];
          const rank = item.frequency[`${source}_rank`];
          if (!['matched_exact_modified_lemma', 'not_in_source'].includes(matchStatus)) {
            issue(errors, 'INCOMPLETE_FREQUENCY_SOURCE_CHECK', p + '.frequency.' + source, 'Cada lista cotejada debe registrar coincidencia exacta o ausencia verificada.');
          }
          if (matchStatus === 'not_in_source' && rank !== null) {
            issue(errors, 'FREQUENCY_ABSENCE_HAS_RANK', p + '.frequency.' + source, 'Una entrada ausente de la lista no puede conservar un rango.');
          }
          if (matchStatus === 'matched_exact_modified_lemma' && rank === null) {
            issue(errors, 'FREQUENCY_MATCH_MISSING_RANK', p + '.frequency.' + source, 'Una coincidencia exacta requiere su rango.');
          }
        }
      }
      if (item.frequency.validation_status === 'pending_corpus_match') pendingFrequency++;
    }
    const identity = [item.cefr_level, item.category_id, item.lexical_form?.toLowerCase(), item.meaning_es?.toLowerCase()].join('|');
    if (identities.has(identity)) issue(errors, 'DUPLICATE_LEXICAL_IDENTITY', p, 'Hay una unidad duplicada con el mismo nivel, categoría, forma y sentido.');
    identities.add(identity);
    if (!Array.isArray(item.examples) || item.examples.length < 1) {
      issue(errors, 'MISSING_EXAMPLES', p + '.examples', 'Cada unidad debe tener al menos un ejemplo contextual.');
    } else {
      const positions = new Set();
      const texts = new Set();
      for (const [exampleIndex, example] of item.examples.entries()) {
        const ep = p + '.examples[' + exampleIndex + ']';
        exampleCount++;
        const sharedKey = (example.english_text || '').trim().toLocaleLowerCase('en-US');
        if (sharedKey) {
          const shared = sharedExamples.get(sharedKey) || [];
          shared.push({ item_id: item.id, lexical_form: item.lexical_form, position: example.position });
          sharedExamples.set(sharedKey, shared);
        }
        if (!nonEmpty(example.english_text) || !nonEmpty(example.spanish_translation)) {
          issue(errors, 'INCOMPLETE_EXAMPLE', ep, 'El ejemplo requiere inglés y traducción contextual.');
        }
        if (!Number.isInteger(example.position) || example.position < 1 || positions.has(example.position)) {
          issue(errors, 'INVALID_EXAMPLE_POSITION', ep + '.position', 'La posición debe ser un entero único y positivo.');
        }
        positions.add(example.position);
        const normalized = (example.english_text || '').trim().toLowerCase();
        if (texts.has(normalized)) issue(errors, 'DUPLICATE_EXAMPLE', ep, 'El ejemplo está repetido dentro de la misma unidad.');
        texts.add(normalized);
        if (example.pronunciation_status === 'approved') {
          const hasCandidate = Array.isArray(example.pronunciation_candidates)
            && example.pronunciation_candidates.some(c => nonEmpty(c.slow_guide) && nonEmpty(c.natural_guide) && c.status === 'approved');
          if (!hasCandidate) issue(errors, 'UNVERIFIED_APPROVED_EXAMPLE_PRONUNCIATION', ep, 'No se puede aprobar una pronunciación de ejemplo sin guía lenta y natural validadas.');
        } else if (example.pronunciation_status?.includes('pending')) {
          pendingPronunciation++;
        }
      }
    }
    if (item.pronunciation?.status === 'approved') {
      if (!nonEmpty(item.pronunciation.spanish_guide_slow) || !nonEmpty(item.pronunciation.spanish_guide_natural)) {
        issue(errors, 'APPROVED_PRONUNCIATION_INCOMPLETE', p + '.pronunciation', 'La pronunciación aprobada requiere ambas guías.');
      }
    } else if (item.pronunciation?.status?.includes('pending')) {
      pendingPronunciation++;
    }
    if (item.review?.editorial_status !== 'approved') pendingEditorial++;
    if (item.publication_status !== 'published') draftCount++;
    if (item.publication_status === 'published') {
      if (item.review?.editorial_status !== 'approved') issue(errors, 'UNREVIEWED_ITEM_PUBLISHED', p, 'Un ítem sin revisión editorial aprobada no puede publicarse.');
      if (item.pronunciation?.status !== 'approved') issue(errors, 'UNREVIEWED_PRONUNCIATION_PUBLISHED', p, 'Un ítem publicado debe tener pronunciación aprobada o indicar explícitamente que no utiliza guía fonética.');
    }
  }

  const resources = Array.isArray(catalog.comprehension_resources) ? catalog.comprehension_resources : [];
  const resourceIds = new Set();
  const resourceCoverage = {};
  for (const [index, resource] of resources.entries()) {
    const p = '$.comprehension_resources[' + index + ']';
    if (!nonEmpty(resource.id) || resourceIds.has(resource.id)) issue(errors, 'DUPLICATE_RESOURCE_ID', p + '.id', 'Cada recurso requiere un id único.');
    resourceIds.add(resource.id);
    if (!TRACKS.has(resource.track)) issue(errors, 'INVALID_RESOURCE_TRACK', p + '.track', 'Ruta no reconocida.');
    if (!LEVELS.has(resource.cefr_level)) issue(errors, 'INVALID_RESOURCE_LEVEL', p + '.cefr_level', 'Nivel no canónico.');
    if (!['reading', 'listening'].includes(resource.skill)) issue(errors, 'INVALID_RESOURCE_SKILL', p + '.skill', 'Solo se admiten recursos de reading o listening.');
    if (!nonEmpty(resource.content)) issue(errors, 'MISSING_RESOURCE_CONTENT', p + '.content', 'Falta el texto o guion fuente.');
    if (!resource.difficulty_profile || !nonEmpty(resource.difficulty_profile.pattern)) issue(errors, 'MISSING_DIFFICULTY_PROFILE', p + '.difficulty_profile', 'Cada recurso requiere perfil de dificultad.');
    if (!Number.isInteger(resource.word_count) || resource.word_count !== wordCount(resource.content || '')) {
      issue(errors, 'WORD_COUNT_MISMATCH', p + '.word_count', 'El recuento de palabras no coincide con el contenido.');
    }
    const questions = Array.isArray(resource.questions) ? resource.questions : [];
    if (questions.length < 2) {
      issue(errors, 'MISSING_COMPREHENSION_QUESTIONS', p + '.questions', 'Cada recurso requiere al menos dos preguntas de comprensión.');
    }
    const questionIds = new Set();
    for (const [questionIndex, question] of questions.entries()) {
      const qp = p + '.questions[' + questionIndex + ']';
      if (!nonEmpty(question.id) || questionIds.has(question.id)) {
        issue(errors, 'DUPLICATE_OR_MISSING_QUESTION_ID', qp + '.id', 'Cada pregunta requiere un id único dentro del recurso.');
      }
      questionIds.add(question.id);
      if (!nonEmpty(question.prompt) || question.type !== 'multiple_choice') {
        issue(errors, 'INVALID_COMPREHENSION_QUESTION', qp, 'La pregunta requiere prompt y tipo multiple_choice.');
      }
      const options = Array.isArray(question.options) ? question.options : [];
      const optionIds = new Set();
      for (const [optionIndex, option] of options.entries()) {
        if (!nonEmpty(option.id) || optionIds.has(option.id) || !nonEmpty(option.text)) {
          issue(errors, 'INVALID_COMPREHENSION_OPTION', qp + '.options[' + optionIndex + ']', 'Cada opción requiere id/texto y no puede repetirse.');
        }
        optionIds.add(option.id);
      }
      if (options.length < 3 || options.length > 4 || !optionIds.has(question.correct_option_id)) {
        issue(errors, 'INVALID_COMPREHENSION_ANSWER', qp, 'La pregunta requiere 3–4 opciones y una clave que exista.');
      }
      if (!['pending_human_review', 'approved'].includes(question.editorial_status)) {
        issue(errors, 'INVALID_QUESTION_EDITORIAL_STATUS', qp + '.editorial_status', 'El estado editorial de la pregunta no es válido.');
      }
      if (resource.publication_status === 'published' && question.editorial_status !== 'approved') {
        issue(errors, 'UNREVIEWED_COMPREHENSION_QUESTION_PUBLISHED', qp, 'No se publica un recurso con preguntas pendientes de revisión.');
      }
    }
    if (resource.skill === 'listening' && resource.transcript_available === true) {
      issue(errors, 'LISTENING_TRANSCRIPT_EXPOSED', p + '.transcript_available', 'El transcript de listening no se expone hasta que exista un flujo posterior a la respuesta.');
    }
    if (resource.skill === 'listening' && resource.publication_status === 'published') {
      if (!nonEmpty(resource.audio?.asset_url) || resource.audio?.status !== 'approved') {
        issue(errors, 'LISTENING_WITHOUT_APPROVED_AUDIO', p + '.audio', 'Un recurso auditivo publicado requiere un audio real y aprobado.');
      }
    }
    const key = [resource.track, resource.cefr_level, resource.skill].join('|');
    resourceCoverage[key] = (resourceCoverage[key] || 0) + 1;
  }
  for (const [englishText, entries] of sharedExamples) {
    const uniqueItems = [...new Set(entries.map((entry) => entry.item_id))];
    if (uniqueItems.length > 1) {
      warnings.push({
        code: 'SHARED_EXAMPLE_ACROSS_ITEMS',
        message: 'El mismo ejemplo inglés aparece en más de una unidad; revisar si el contexto es intencional.',
        english_text: englishText,
        entries,
      });
    }
  }
  for (const [translation, entries] of repeatedTranslations) {
    if (entries.length > 1) {
      warnings.push({
        code: 'REPEATED_SPANISH_MEANING',
        message: 'El mismo significado español aparece en varias unidades; comprobar polisemia, categoría y sentido antes de deduplicar.',
        meaning_es: translation,
        entries,
      });
    }
  }
  const summary = {
    categories: categories.length,
    lexical_items: items.length,
    comprehension_resources: resources.length,
    reading_resources: resources.filter(r => r.skill === 'reading').length,
    listening_resources: resources.filter(r => r.skill === 'listening').length,
    comprehension_questions: resources.reduce((total, resource) => total + (resource.questions?.length ?? 0), 0),
    pending_question_review: resources.reduce((total, resource) => total + (resource.questions ?? []).filter(question => question.editorial_status !== 'approved').length, 0),
    examples: exampleCount,
    level_counts: levelCounts,
    track_level_counts: trackCounts,
    lexical_type_counts: lexicalTypeCounts,
    shared_example_warnings: warnings.filter(warning => warning.code === 'SHARED_EXAMPLE_ACROSS_ITEMS').length,
    repeated_translation_warnings: warnings.filter(warning => warning.code === 'REPEATED_SPANISH_MEANING').length,
    pending_editorial_review: pendingEditorial,
    pending_pronunciation_review: pendingPronunciation,
    pending_frequency_match: pendingFrequency,
    draft_items: draftCount,
    resource_coverage: resourceCoverage,
  };
  return { valid: errors.length === 0, errors, warnings, summary };
}

export function auditCatalogFile(filePath = DEFAULT_CATALOG_PATH) {
  const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return auditCatalog(catalog);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const filePath = args.find(arg => !arg.startsWith('--')) || DEFAULT_CATALOG_PATH;
  const report = auditCatalogFile(filePath);
  if (args.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write('DevFluency lexical catalog v2\n');
    process.stdout.write(JSON.stringify(report.summary, null, 2) + '\n');
    if (report.errors.length) process.stderr.write(JSON.stringify(report.errors, null, 2) + '\n');
    process.stdout.write(report.valid ? 'VALID\n' : 'INVALID\n');
  }
  if (!report.valid) process.exitCode = 1;
}
