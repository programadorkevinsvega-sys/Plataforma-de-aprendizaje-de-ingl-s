import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { importLexicalCatalog } from '../import_lexical_catalog.mjs';
import { importCurriculumPackage } from '../import_content_package.mjs';
import { publishInitialRelease, releaseInputs, resolveInitialReleaseEditor } from '../deploy_initial_release.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DATABASE_URL = process.env.DATABASE_URL;
const release = releaseInputs(ROOT);
const catalog = release.merged;
const sha256 = release.catalogSha256;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 4 }) : null;
const SOURCE_CATALOG = 'devfluency.lexical-catalog.v2';
const ITEM_SOURCE_KEYS = catalog.lexical_items.map((item) => `v2:item:${item.id}`);
const EXAMPLE_SOURCE_KEYS = catalog.lexical_items.flatMap((item) =>
  (item.examples ?? []).map((example) => `v2:example:${item.id}:${example.position}`),
);
const RESOURCE_SOURCE_KEYS = catalog.comprehension_resources.map((resource) => `v2:resource:${resource.id}`);
let editorId = null;

before(async () => {
  if (!pool) return;
  editorId = await resolveInitialReleaseEditor(pool);
  const serviceIdentity = await pool.query(
    "SELECT email, password_hash FROM users WHERE id = $1",
    [editorId],
  );
  assert.equal(serviceIdentity.rows[0].email, "curriculum-release@system.devfluency.invalid");
  assert.equal(serviceIdentity.rows[0].password_hash, "not-a-login-hash");
});

after(async () => {
  if (!pool) return;
  const versions = await pool.query(
    "SELECT version.id FROM course_versions AS version JOIN courses AS course ON course.id = version.course_id WHERE course.slug = 'english-general'",
  );
  const versionIds = versions.rows.map((row) => row.id);
  if (versionIds.length > 0) {
    for (const table of [
      "course_enrollments",
      "course_version_reviews",
      "lesson_prerequisites",
      "lesson_learning_objectives",
      "learning_objective_sentences",
      "learning_objective_vocabulary",
      "learning_objective_skills",
      "course_lessons",
      "learning_objectives",
      "course_units",
      "curriculum_content_package_imports",
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE course_version_id = ANY($1::uuid[])`, [versionIds]);
    }
    await pool.query("DELETE FROM course_versions WHERE id = ANY($1::uuid[])", [versionIds]);
  }
  await pool.query("DELETE FROM courses WHERE slug = 'english-general'");
  await pool.query('DELETE FROM context_sentences WHERE source_key = ANY($1::text[])', [EXAMPLE_SOURCE_KEYS]);
  await pool.query('DELETE FROM vocabulary_words WHERE source_key = ANY($1::text[])', [ITEM_SOURCE_KEYS]);
  await pool.query('DELETE FROM curriculum_comprehension_resources WHERE source_key = ANY($1::text[])', [RESOURCE_SOURCE_KEYS]);
  await pool.query(
    'DELETE FROM lexical_catalog_imports WHERE catalog_key = $1 AND content_sha256 = $2',
    ['devfluency-lexical-catalog-v2', sha256],
  );
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
      'SELECT count(*)::int AS count FROM vocabulary_words WHERE source_key = ANY($1::text[])',
      [ITEM_SOURCE_KEYS],
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
          (SELECT count(*)::int FROM vocabulary_words WHERE source_key = ANY($1::text[])) AS items,
          (SELECT count(*)::int FROM context_sentences WHERE source_key = ANY($2::text[])) AS examples,
          (SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_key = ANY($3::text[])) AS resources,
          (SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_key = ANY($3::text[]) AND skill = 'listening' AND transcript_available = TRUE) AS exposed_listening_transcripts,
          (SELECT COALESCE(sum(jsonb_array_length(questions)), 0)::int FROM curriculum_comprehension_resources WHERE source_key = ANY($3::text[])) AS questions,
          (SELECT count(*)::int FROM curriculum_comprehension_resources resource CROSS JOIN LATERAL jsonb_array_elements(resource.questions) AS question(value) WHERE resource.source_key = ANY($3::text[]) AND question.value ->> 'editorial_status' = 'pending_human_review') AS pending_questions,
          (SELECT count(*)::int FROM vocabulary_words WHERE source_key = ANY($1::text[]) AND publication_status = 'draft') AS draft_items,
          (SELECT count(*)::int FROM vocabulary_words WHERE source_key = ANY($1::text[]) AND publication_status = 'published') AS published_items,
          (SELECT count(*)::int FROM context_sentences WHERE source_key = ANY($2::text[]) AND publication_status = 'published') AS published_examples,
          (SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_key = ANY($3::text[]) AND publication_status = 'published') AS published_resources`,
      [ITEM_SOURCE_KEYS, EXAMPLE_SOURCE_KEYS, RESOURCE_SOURCE_KEYS],
    );
    assert.equal(counts.rows[0].items, catalog.lexical_items.length);
    assert.equal(counts.rows[0].examples, expectedExamples);
    assert.equal(counts.rows[0].resources, catalog.comprehension_resources.length);
    assert.equal(counts.rows[0].exposed_listening_transcripts, 0);
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

    const packages = [
      {
        path: 'tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json',
        level: 'PRE_A1',
      },
      {
        path: 'tests/fixtures/curriculum/initial-release-english-general-a1-v1.json',
        level: 'A1',
      },
    ];
    for (const entry of packages) {
      const packagePath = path.join(ROOT, entry.path);
      const validation = spawnSync(
        'python3',
        [path.join(ROOT, 'tools/curriculum/validate_content_package.py'), packagePath, '--json'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      );
      assert.equal(validation.status, 0, validation.stderr || validation.stdout);
      const validated = JSON.parse(validation.stdout);
      const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
      assert.equal(packageData.version.cefr_level, entry.level);
      const imported = await importCurriculumPackage(
        pool,
        packageData,
        validated.sha256,
        { apply: true, actorUserId: editorId },
      );
      assert.ok(['imported', 'already_imported'].includes(imported.state));
    }

    const audioAssets = new Map(release.listeningIds.map((resourceId) => [
      resourceId,
      {
        status: 'approved',
        asset_url: `/audio/listening/${resourceId}.mp3`,
        format: 'mp3',
        audio_sha256: 'a'.repeat(64),
        audio_review: { status: 'owner_approved' },
        license_review: { status: 'provider_terms_not_assessed' },
      },
    ]));
    const publication = await publishInitialRelease(pool, editorId, release, audioAssets, { apply: false });
    assert.equal(publication.applied, false);
    assert.equal(publication.dry_run, true);
    assert.equal(publication.published_items, 790);
    assert.equal(publication.published_examples, 2201);
    assert.equal(publication.published_resources, 26);
    assert.equal(publication.questions, 52);
    assert.equal(publication.listening_with_audio, 13);
    assert.equal(publication.published_courses, 2);
    assert.equal(publication.units, 6);
    assert.equal(publication.lessons, 10);
    assert.equal(publication.objectives, 10);

    const verificationClient = await pool.connect();
    try {
      await verificationClient.query("BEGIN");
      await verificationClient.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
      const publishedReferences = await verificationClient.query(
      `SELECT
         (SELECT count(*)::int FROM learning_objective_vocabulary) AS vocabulary_references,
         (SELECT count(*)::int FROM learning_objective_sentences) AS sentence_references,
         (SELECT count(*)::int FROM course_versions version JOIN courses course ON course.id = version.course_id WHERE course.slug = 'english-general' AND version.status = 'draft' AND version.cefr_level = ANY($1::text[])) AS draft_levels`,
      [['PRE_A1', 'A1']],
    );
      assert.equal(publishedReferences.rows[0].draft_levels, 2);
      assert.equal(publishedReferences.rows[0].vocabulary_references, 31);
      assert.equal(publishedReferences.rows[0].sentence_references, 27);

      const studentResources = await verificationClient.query(
      `SELECT skill, publication_status, transcript_available,
              jsonb_array_length(questions)::int AS questions,
              questions -> 0 ? 'correct_option_id' AS exposes_answer
         FROM curriculum_comprehension_resources
        WHERE source_key = ANY($1::text[])
        ORDER BY source_key`,
      [RESOURCE_SOURCE_KEYS],
    );
      assert.equal(studentResources.rowCount, 26);
      assert.ok(studentResources.rows.every((row) => row.publication_status === 'draft'));
      assert.ok(studentResources.rows.filter((row) => row.skill === 'listening').every((row) => row.transcript_available === false));
      assert.ok(studentResources.rows.every((row) => row.exposes_answer === true));

      await verificationClient.query("ROLLBACK");
    } finally {
      verificationClient.release();
    }

    const republished = await publishInitialRelease(pool, editorId, release, audioAssets, { apply: false });
    assert.equal(republished.published_courses, 2);
    assert.equal(republished.published_items, 790);
  });
}
