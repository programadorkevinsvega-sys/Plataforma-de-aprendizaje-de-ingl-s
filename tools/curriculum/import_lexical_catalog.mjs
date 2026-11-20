import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { auditCatalog } from './audit_lexical_catalog.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_KEY = 'devfluency-lexical-catalog-v2';
const SOURCE_CATALOG = 'devfluency.lexical-catalog.v2';

const json = (value) => JSON.stringify(value ?? {});
const approvedGuide = (pronunciation, field) =>
  pronunciation?.status === 'approved' ? pronunciation[field] ?? null : null;
const approvedAudioUrl = (audio) =>
  audio?.status === 'approved' ? audio.asset_url ?? null : null;

export async function importLexicalCatalog(pool, catalog, contentSha256, { apply = false, actorUserId = null } = {}) {
  const report = auditCatalog(catalog);
  if (!report.valid) {
    const error = new Error('El catálogo léxico no supera la auditoría estricta.');
    error.details = report.errors;
    throw error;
  }
  if (!/^[a-f0-9]{64}$/i.test(contentSha256)) {
    throw new Error('contentSha256 debe ser un SHA-256 hexadecimal de 64 caracteres.');
  }

  const items = catalog.lexical_items.map((item) => ({
    source_key: `v2:item:${item.id}`,
    lexical_form: item.lexical_form,
    spanish_phonetic: approvedGuide(item.pronunciation, 'spanish_guide_slow'),
    spanish_phonetic_natural: approvedGuide(item.pronunciation, 'spanish_guide_natural'),
    meaning_es: item.meaning_es,
    category_id: item.category_id,
    cefr_level: item.cefr_level,
    lexical_type: item.lexical_type,
    definition_en: item.definition_en,
    tracks: item.tracks,
    lexical_register: item.register,
    editorial_priority: item.editorial_priority,
    usefulness: item.usefulness,
    frequency: item.frequency,
    context_tags: item.context_tags,
    usage_mode: item.usage_mode,
    pronunciation_status: item.pronunciation?.status ?? 'not_authored_pending_linguistic_validation',
    pronunciation_metadata: item.pronunciation ?? {},
    review: item.review ?? {},
    provenance: item.provenance ?? {},
  }));

  const examples = catalog.lexical_items.flatMap((item) => (item.examples ?? []).map((example) => ({
    source_key: `v2:example:${item.id}:${example.position}`,
    item_source_key: `v2:item:${item.id}`,
    position: example.position,
    english_text: example.english_text,
    spanish_translation: example.spanish_translation,
    spanish_phonetic: example.pronunciation_status === 'approved'
      ? example.pronunciation_candidates?.find((candidate) => candidate.status === 'approved')?.slow_guide ?? null
      : null,
    spanish_phonetic_natural: example.pronunciation_status === 'approved'
      ? example.pronunciation_candidates?.find((candidate) => candidate.status === 'approved')?.natural_guide ?? null
      : null,
    pronunciation_status: example.pronunciation_status ?? 'not_authored_pending_linguistic_validation',
    pronunciation_candidates: example.pronunciation_candidates ?? [],
    editorial_status: example.editorial_status ?? 'pending_linguistic_review',
    audio_url: approvedAudioUrl(example.audio),
    audio_metadata: example.audio ?? {},
    provenance: {
      source_records: example.source_records ?? [],
      editorial_review: example.editorial_review ?? null,
    },
  })));

  const resources = catalog.comprehension_resources.map((resource) => ({
    source_key: `v2:resource:${resource.id}`,
    track: resource.track,
    cefr_level: resource.cefr_level,
    skill: resource.skill,
    title: resource.title,
    topic: resource.topic ?? '',
    content: resource.content,
    word_count: resource.word_count,
    sentence_count: resource.sentence_count ?? null,
    estimated_minutes: resource.estimated_minutes ?? null,
    difficulty_profile: resource.difficulty_profile,
    comprehension_focus: resource.comprehension_focus ?? '',
    questions: resource.questions ?? [],
    lexical_tags: resource.lexical_tags ?? [],
    transcript_available: resource.transcript_available ?? false,
    audio_metadata: resource.audio ?? {},
    editorial_status: resource.editorial_status ?? 'pending_editorial_and_level_review',
    publication_status: resource.publication_status ?? 'draft',
    provenance: resource.provenance ?? {},
  }));

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['devfluency:lexical-catalog:v2'],
    );

    if (apply) {
      if (!actorUserId) throw new Error('--actor-user-id es obligatorio cuando se utiliza --apply.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
        throw new Error('--actor-user-id debe ser un UUID válido.');
      }
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [actorUserId],
      );
      const editor = await client.query('SELECT app_is_content_editor() AS allowed');
      if (!editor.rows[0]?.allowed) {
        throw new Error('El actor no está registrado en content_editors; no se importó contenido.');
      }
    }

    const previous = await client.query(
      'SELECT id FROM lexical_catalog_imports WHERE catalog_key = $1 AND content_sha256 = $2',
      [CATALOG_KEY, contentSha256],
    );
    if (previous.rowCount > 0) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return {
        state: 'already_imported',
        applied: false,
        dryRun: !apply,
        contentSha256,
        lexicalItems: items.length,
        examples: examples.length,
        resources: resources.length,
      };
    }

    const itemKeys = items.map((item) => item.source_key);
    const exampleKeys = examples.map((example) => example.source_key);
    const resourceKeys = resources.map((resource) => resource.source_key);

    const publishedConflicts = await client.query(
      `SELECT source_key FROM vocabulary_words
        WHERE source_key = ANY($1::text[]) AND publication_status = 'published'
          AND catalog_hash IS DISTINCT FROM $2
       UNION ALL
       SELECT source_key FROM context_sentences
        WHERE source_key = ANY($3::text[]) AND publication_status = 'published'
          AND catalog_hash IS DISTINCT FROM $2
       UNION ALL
       SELECT source_key FROM curriculum_comprehension_resources
        WHERE source_key = ANY($4::text[]) AND publication_status = 'published'
          AND catalog_hash IS DISTINCT FROM $2`,
      [itemKeys, contentSha256, exampleKeys, resourceKeys],
    );
    if (publishedConflicts.rowCount > 0) {
      throw new Error(
        'El catálogo contiene filas ya publicadas que cambiarían. Retire/versione esas unidades mediante el flujo editorial antes de importar otra revisión.',
      );
    }

    await client.query(
      `INSERT INTO vocabulary_words (
          source_key, source_catalog, catalog_hash, word, spanish_phonetic,
          spanish_translation, category, level, spanish_phonetic_natural,
          lexical_type, definition_en, tracks, lexical_register,
          editorial_priority, usefulness, frequency_metadata, context_tags,
          usage_mode, pronunciation_status, pronunciation_metadata,
          editorial_metadata, provenance, publication_status
       )
       SELECT entry.source_key, $2, $3, entry.lexical_form, entry.spanish_phonetic,
              entry.meaning_es, entry.category_id, entry.cefr_level,
              entry.spanish_phonetic_natural, entry.lexical_type, entry.definition_en,
              entry.tracks, entry.lexical_register, entry.editorial_priority,
              entry.usefulness, entry.frequency, entry.context_tags, entry.usage_mode,
              entry.pronunciation_status, entry.pronunciation_metadata, entry.review,
              entry.provenance, 'draft'
         FROM jsonb_to_recordset($1::jsonb) AS entry(
           source_key text, lexical_form text, spanish_phonetic text,
           spanish_phonetic_natural text, meaning_es text, category_id text,
           cefr_level text, lexical_type text, definition_en text, tracks text[],
           lexical_register text, editorial_priority text, usefulness text,
           frequency jsonb, context_tags text[], usage_mode text,
           pronunciation_status text, pronunciation_metadata jsonb, review jsonb,
           provenance jsonb
         )
       ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET
          source_catalog = EXCLUDED.source_catalog,
          catalog_hash = EXCLUDED.catalog_hash,
          word = EXCLUDED.word,
          spanish_phonetic = EXCLUDED.spanish_phonetic,
          spanish_translation = EXCLUDED.spanish_translation,
          category = EXCLUDED.category,
          level = EXCLUDED.level,
          spanish_phonetic_natural = EXCLUDED.spanish_phonetic_natural,
          lexical_type = EXCLUDED.lexical_type,
          definition_en = EXCLUDED.definition_en,
          tracks = EXCLUDED.tracks,
          lexical_register = EXCLUDED.lexical_register,
          editorial_priority = EXCLUDED.editorial_priority,
          usefulness = EXCLUDED.usefulness,
          frequency_metadata = EXCLUDED.frequency_metadata,
          context_tags = EXCLUDED.context_tags,
          usage_mode = EXCLUDED.usage_mode,
          pronunciation_status = EXCLUDED.pronunciation_status,
          pronunciation_metadata = EXCLUDED.pronunciation_metadata,
          editorial_metadata = EXCLUDED.editorial_metadata,
          provenance = EXCLUDED.provenance,
          publication_status = 'draft'
       WHERE vocabulary_words.publication_status = 'draft'`,
      [json(items), SOURCE_CATALOG, contentSha256],
    );

    await client.query(
      `INSERT INTO context_sentences (
          source_key, source_catalog, catalog_hash, word_id, position,
          english_text, spanish_phonetic, spanish_phonetic_natural,
          spanish_translation, audio_url, pronunciation_status,
          pronunciation_candidates, editorial_status, audio_metadata,
          provenance, publication_status
       )
       SELECT entry.source_key, $2, $3, word.id, entry.position,
              entry.english_text, entry.spanish_phonetic,
              entry.spanish_phonetic_natural, entry.spanish_translation,
              entry.audio_url, entry.pronunciation_status,
              entry.pronunciation_candidates, entry.editorial_status,
              entry.audio_metadata, entry.provenance, 'draft'
         FROM jsonb_to_recordset($1::jsonb) AS entry(
           source_key text, item_source_key text, position integer,
           english_text text, spanish_translation text, spanish_phonetic text,
           spanish_phonetic_natural text, pronunciation_status text,
           pronunciation_candidates jsonb, editorial_status text,
           audio_url text, audio_metadata jsonb, provenance jsonb
         )
         JOIN vocabulary_words AS word ON word.source_key = entry.item_source_key
       ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET
          source_catalog = EXCLUDED.source_catalog,
          catalog_hash = EXCLUDED.catalog_hash,
          word_id = EXCLUDED.word_id,
          position = EXCLUDED.position,
          english_text = EXCLUDED.english_text,
          spanish_phonetic = EXCLUDED.spanish_phonetic,
          spanish_phonetic_natural = EXCLUDED.spanish_phonetic_natural,
          spanish_translation = EXCLUDED.spanish_translation,
          audio_url = EXCLUDED.audio_url,
          pronunciation_status = EXCLUDED.pronunciation_status,
          pronunciation_candidates = EXCLUDED.pronunciation_candidates,
          editorial_status = EXCLUDED.editorial_status,
          audio_metadata = EXCLUDED.audio_metadata,
          provenance = EXCLUDED.provenance,
          publication_status = 'draft'
       WHERE context_sentences.publication_status = 'draft'`,
      [json(examples), SOURCE_CATALOG, contentSha256],
    );

    await client.query(
      `INSERT INTO curriculum_comprehension_resources (
          source_key, source_catalog, catalog_hash, track, cefr_level,
          skill, title, topic, content, word_count, sentence_count,
          estimated_minutes, difficulty_profile, comprehension_focus, questions,
          lexical_tags, transcript_available, audio_metadata,
          editorial_status, publication_status, provenance
       )
       SELECT entry.source_key, $2, $3, entry.track, entry.cefr_level,
              entry.skill, entry.title, entry.topic, entry.content,
              entry.word_count, entry.sentence_count, entry.estimated_minutes,
              entry.difficulty_profile, entry.comprehension_focus, entry.questions,
              entry.lexical_tags, entry.transcript_available, entry.audio_metadata,
              entry.editorial_status, 'draft', entry.provenance
         FROM jsonb_to_recordset($1::jsonb) AS entry(
           source_key text, track text, cefr_level text, skill text,
           title text, topic text, content text, word_count integer,
           sentence_count integer, estimated_minutes integer,
           difficulty_profile jsonb, comprehension_focus text, questions jsonb,
           lexical_tags text[], transcript_available boolean,
           audio_metadata jsonb, editorial_status text,
           publication_status text, provenance jsonb
         )
       ON CONFLICT (source_key) DO UPDATE SET
          source_catalog = EXCLUDED.source_catalog,
          catalog_hash = EXCLUDED.catalog_hash,
          track = EXCLUDED.track,
          cefr_level = EXCLUDED.cefr_level,
          skill = EXCLUDED.skill,
          title = EXCLUDED.title,
          topic = EXCLUDED.topic,
          content = EXCLUDED.content,
          word_count = EXCLUDED.word_count,
          sentence_count = EXCLUDED.sentence_count,
          estimated_minutes = EXCLUDED.estimated_minutes,
          difficulty_profile = EXCLUDED.difficulty_profile,
          comprehension_focus = EXCLUDED.comprehension_focus,
          questions = EXCLUDED.questions,
          lexical_tags = EXCLUDED.lexical_tags,
          transcript_available = EXCLUDED.transcript_available,
          audio_metadata = EXCLUDED.audio_metadata,
          editorial_status = EXCLUDED.editorial_status,
          publication_status = 'draft',
          provenance = EXCLUDED.provenance,
          updated_at = CURRENT_TIMESTAMP
       WHERE curriculum_comprehension_resources.publication_status = 'draft'`,
      [json(resources), SOURCE_CATALOG, contentSha256],
    );

    await client.query(
      `UPDATE vocabulary_words SET publication_status = 'archived', catalog_hash = $2
        WHERE source_catalog = $1 AND publication_status = 'draft'
          AND catalog_hash IS DISTINCT FROM $2 AND source_key <> ALL($3::text[])`,
      [SOURCE_CATALOG, contentSha256, itemKeys],
    );
    await client.query(
      `UPDATE context_sentences SET publication_status = 'archived', catalog_hash = $2
        WHERE source_catalog = $1 AND publication_status = 'draft'
          AND catalog_hash IS DISTINCT FROM $2 AND source_key <> ALL($3::text[])`,
      [SOURCE_CATALOG, contentSha256, exampleKeys],
    );
    await client.query(
      `UPDATE curriculum_comprehension_resources SET publication_status = 'archived', catalog_hash = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE source_catalog = $1 AND publication_status = 'draft'
          AND catalog_hash IS DISTINCT FROM $2 AND source_key <> ALL($3::text[])`,
      [SOURCE_CATALOG, contentSha256, resourceKeys],
    );

    await client.query(
      `INSERT INTO lexical_catalog_imports (
          catalog_key, schema_version, content_sha256, lexical_items,
          examples, comprehension_resources, imported_by, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb)`,
      [
        CATALOG_KEY,
        catalog.schema_version,
        contentSha256,
        items.length,
        examples.length,
        resources.length,
        actorUserId,
        json(catalog.metadata),
      ],
    );

    if (apply) {
      await client.query('COMMIT');
      transactionOpen = false;
    } else {
      await client.query('ROLLBACK');
      transactionOpen = false;
    }

    return {
      state: 'imported',
      applied: apply,
      dryRun: !apply,
      contentSha256,
      lexicalItems: items.length,
      examples: examples.length,
      resources: resources.length,
    };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg, index) =>
    !arg.startsWith('--') && args[index - 1] !== '--actor-user-id',
  ) ?? 'crates/content-vocabulary-service/data/lexical_catalog.v2.json';
  const apply = args.includes('--apply');
  const actorIndex = args.indexOf('--actor-user-id');
  const actorUserId = actorIndex >= 0 ? args[actorIndex + 1] : null;
  const filePath = path.resolve(process.cwd(), file);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria.');
  const bytes = readFileSync(filePath);
  const catalog = JSON.parse(bytes.toString('utf8'));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await importLexicalCatalog(pool, catalog, sha256, { apply, actorUserId });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write((error.stack ?? error.message) + '\n');
    process.exitCode = 1;
  });
}
