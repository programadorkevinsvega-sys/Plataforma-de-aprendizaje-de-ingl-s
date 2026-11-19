import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { importLexicalCatalog } from '../import_lexical_catalog.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CATALOG_PATH = path.join(ROOT, 'crates/content-vocabulary-service/data/lexical_catalog.v2.json');
const DATABASE_URL = process.env.DATABASE_URL;
const bytes = readFileSync(CATALOG_PATH);
const catalog = JSON.parse(bytes.toString('utf8'));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 4 }) : null;
const SOURCE_CATALOG = 'devfluency.lexical-catalog.v2';
const editorId = randomUUID();

before(async () => {
  if (!pool) return;
  await pool.query(
    'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
    [editorId, `${editorId}@lexical-catalog-test.invalid`, 'ci-test-password-hash', 'CI Lexical Catalog Editor'],
  );
  await pool.query('INSERT INTO content_editors (user_id) VALUES ($1)', [editorId]);
});

after(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM context_sentences WHERE source_catalog = $1', [SOURCE_CATALOG]);
  await pool.query('DELETE FROM vocabulary_words WHERE source_catalog = $1', [SOURCE_CATALOG]);
  await pool.query('DELETE FROM curriculum_comprehension_resources WHERE source_catalog = $1', [SOURCE_CATALOG]);
  await pool.query('DELETE FROM lexical_catalog_imports WHERE catalog_key = $1', ['devfluency-lexical-catalog-v2']);
  await pool.query('DELETE FROM content_editors WHERE user_id = $1', [editorId]);
  await pool.query('DELETE FROM users WHERE id = $1', [editorId]);
  await pool.end();
});

if (!pool) {
  test('lexical catalog importer integration requires DATABASE_URL', { skip: true }, () => {});
} else {
  test('imports lexical catalog v2 atomically, keeps it hidden, and is idempotent', async () => {
    const dryRun = await importLexicalCatalog(pool, catalog, sha256, { apply: false });
    assert.equal(dryRun.state, 'imported');
    assert.equal(dryRun.applied, false);
    assert.equal(dryRun.dryRun, true);

    const absentAfterDryRun = await pool.query(
      'SELECT count(*)::int AS count FROM vocabulary_words WHERE source_catalog = $1',
      [SOURCE_CATALOG],
    );
    assert.equal(absentAfterDryRun.rows[0].count, 0);

    await assert.rejects(
      importLexicalCatalog(pool, catalog, sha256, { apply: true }),
      /--actor-user-id es obligatorio/,
    );
    const applied = await importLexicalCatalog(pool, catalog, sha256, { apply: true, actorUserId: editorId });
    assert.equal(applied.state, 'imported');
    assert.equal(applied.applied, true);
    assert.equal(applied.lexicalItems, catalog.lexical_items.length);
    assert.equal(applied.resources, catalog.comprehension_resources.length);

    const expectedExamples = catalog.lexical_items.reduce(
      (total, item) => total + (item.examples?.length ?? 0),
      0,
    );
    assert.equal(applied.examples, expectedExamples);

    const counts = await pool.query(
      `SELECT
          (SELECT count(*)::int FROM vocabulary_words WHERE source_catalog = $1) AS items,
          (SELECT count(*)::int FROM context_sentences WHERE source_catalog = $1) AS examples,
          (SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1) AS resources,
          (SELECT COALESCE(sum(jsonb_array_length(questions)), 0)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1) AS questions,
          (SELECT count(*)::int FROM curriculum_comprehension_resources resource CROSS JOIN LATERAL jsonb_array_elements(resource.questions) AS question(value) WHERE resource.source_catalog = $1 AND question.value ->> 'editorial_status' = 'pending_human_review') AS pending_questions,
          (SELECT count(*)::int FROM vocabulary_words WHERE source_catalog = $1 AND publication_status = 'draft') AS draft_items,
          (SELECT count(*)::int FROM vocabulary_words WHERE source_catalog = $1 AND publication_status = 'published') AS published_items,
          (SELECT count(*)::int FROM context_sentences WHERE source_catalog = $1 AND publication_status = 'published') AS published_examples,
          (SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1 AND publication_status = 'published') AS published_resources`,
      [SOURCE_CATALOG],
    );
    assert.equal(counts.rows[0].items, catalog.lexical_items.length);
    assert.equal(counts.rows[0].examples, expectedExamples);
    assert.equal(counts.rows[0].resources, catalog.comprehension_resources.length);
    assert.equal(counts.rows[0].questions, 52);
    assert.equal(counts.rows[0].pending_questions, 52);
    assert.equal(counts.rows[0].draft_items, catalog.lexical_items.length);
    assert.equal(counts.rows[0].published_items, 0);
    assert.equal(counts.rows[0].published_examples, 0);
    assert.equal(counts.rows[0].published_resources, 0);

    const listeningPayloadSourceKey = `v2:resource:${catalog.comprehension_resources.find((resource) => resource.skill === 'listening').id}`;
    const studentPayload = await pool.query(
      `SELECT
          CASE WHEN skill = 'listening' AND NOT transcript_available THEN '' ELSE content END AS student_content,
          COALESCE((
            SELECT jsonb_agg(
              question.value - ARRAY['correct_option_id', 'rationale', 'evidence', 'editorial_status']
              ORDER BY question.ordinality
            )
            FROM jsonb_array_elements(questions) WITH ORDINALITY AS question(value, ordinality)
          ), '[]'::jsonb)::text AS questions_json
         FROM curriculum_comprehension_resources
        WHERE source_key = $1 AND publication_status = 'draft'`,
      [listeningPayloadSourceKey],
    );
    assert.equal(studentPayload.rowCount, 1);
    assert.equal(studentPayload.rows[0].student_content, '');
    const publicQuestions = JSON.parse(studentPayload.rows[0].questions_json);
    assert.equal(publicQuestions.length, 2);
    for (const question of publicQuestions) {
      assert.ok(question.prompt);
      assert.ok(Array.isArray(question.options));
      assert.equal('correct_option_id' in question, false);
      assert.equal('rationale' in question, false);
      assert.equal('evidence' in question, false);
      assert.equal('editorial_status' in question, false);
    }

    const client = await pool.connect();
    const firstSourceKey = `v2:item:${catalog.lexical_items[0].id}`;
    const listeningSourceKey = `v2:resource:${catalog.comprehension_resources.find((resource) => resource.skill === 'listening').id}`;
    try {
      await client.query('BEGIN');
      await assert.rejects(
        client.query(
          "UPDATE vocabulary_words SET publication_status = 'review' WHERE source_key = $1",
          [firstSourceKey],
        ),
        /registered content editor/,
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      await client.query(
        "UPDATE vocabulary_words SET publication_status = 'review' WHERE source_key = $1",
        [firstSourceKey],
      );
      await assert.rejects(
        client.query(
          `UPDATE vocabulary_words
              SET publication_status = 'published',
                  editorial_metadata = jsonb_set(editorial_metadata, '{editorial_status}', '"approved"'::jsonb, true),
                  pronunciation_status = 'approved'
            WHERE source_key = $1`,
          [firstSourceKey],
        ),
        /both slow and natural guides/,
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      await client.query(
        "UPDATE vocabulary_words SET publication_status = 'review' WHERE source_key = $1",
        [firstSourceKey],
      );
      await client.query(
        `UPDATE vocabulary_words
            SET publication_status = 'published',
                editorial_metadata = jsonb_set(editorial_metadata, '{editorial_status}', '"approved"'::jsonb, true),
                pronunciation_status = 'not_required'
          WHERE source_key = $1`,
        [firstSourceKey],
      );
      await assert.rejects(
        client.query(
          "UPDATE vocabulary_words SET spanish_translation = 'mutated' WHERE source_key = $1",
          [firstSourceKey],
        ),
        /immutable/,
      );
      await client.query('ROLLBACK');

      const readingSourceKey = `v2:resource:${catalog.comprehension_resources.find((resource) => resource.skill === 'reading').id}`;
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      await client.query(
        "UPDATE curriculum_comprehension_resources SET publication_status = 'review', editorial_status = 'approved' WHERE source_key = $1",
        [readingSourceKey],
      );
      await assert.rejects(
        client.query(
          "UPDATE curriculum_comprehension_resources SET publication_status = 'published' WHERE source_key = $1",
          [readingSourceKey],
        ),
        /Every comprehension question requires editorial approval/,
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      await client.query(
        "UPDATE curriculum_comprehension_resources SET publication_status = 'review', editorial_status = 'approved' WHERE source_key = $1",
        [listeningSourceKey],
      );
      await assert.rejects(
        client.query(
          "UPDATE curriculum_comprehension_resources SET publication_status = 'published' WHERE source_key = $1",
          [listeningSourceKey],
        ),
        /real approved audio asset/,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const ledger = await pool.query(
      'SELECT lexical_items, examples, comprehension_resources, imported_by FROM lexical_catalog_imports WHERE catalog_key = $1 AND content_sha256 = $2',
      ['devfluency-lexical-catalog-v2', sha256],
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].lexical_items, catalog.lexical_items.length);
    assert.equal(ledger.rows[0].examples, expectedExamples);
    assert.equal(ledger.rows[0].comprehension_resources, catalog.comprehension_resources.length);
    assert.equal(ledger.rows[0].imported_by, editorId);

    const duplicate = await importLexicalCatalog(pool, catalog, sha256, { apply: true, actorUserId: editorId });
    assert.equal(duplicate.state, 'already_imported');
    assert.equal(duplicate.applied, false);
  });
}
