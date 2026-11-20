import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BffCurriculumRepository } from '../../src/infrastructure/repositories/BffCurriculumRepository.ts'
import {
  GetCurriculumEditorialVersionsUseCase,
  ImportCurriculumContentPackageUseCase,
  ManageCurriculumEditorialVersionUseCase,
  SaveCurriculumDraftUseCase,
} from '../../src/application/use-cases/CurriculumUseCases.ts'

const versionId = '00000000-0000-4000-8000-000000000101'
const unitId = '00000000-0000-4000-8000-000000000102'
const lessonId = '00000000-0000-4000-8000-000000000103'
const objectiveId = '00000000-0000-4000-8000-000000000104'
const updatedAt = '2026-11-20 22:40:00+00'

function createWorkflowHttp() {
  const calls = []
  const transitions = [
    { action: 'submit', previous_status: 'draft', next_status: 'review' },
    { action: 'review', previous_status: 'review', next_status: 'draft' },
    { action: 'submit', previous_status: 'draft', next_status: 'review' },
    { action: 'review', previous_status: 'review', next_status: 'review' },
    { action: 'publish', previous_status: 'review', next_status: 'published' },
  ]

  const http = {
    async get(path, options = {}) {
      calls.push({ method: 'GET', path, options })
      if (path === '/api/v1/curriculum/editor/versions') {
        return {
          items: [{
            course_version_id: versionId,
            slug: 'english-general-a1',
            track_code: 'general',
            cefr_level: 'A1',
            version_number: 1,
            status: 'draft',
            title: 'English General A1',
            description: 'Initial A1 course',
            imported_at: updatedAt,
            package_sha256: 'a'.repeat(64),
            latest_decision: '',
            latest_comments: '',
            latest_reviewer_id: '',
            can_publish: false,
            updated_at: updatedAt,
          }],
          total: 21,
          page: 2,
          page_size: 10,
          total_pages: 3,
        }
      }
      if (path === `/api/v1/curriculum/courses/${versionId}`) {
        return {
          course: {
            course_version_id: versionId,
            slug: 'english-general-a1',
            track_code: 'general',
            cefr_level: 'A1',
            version_number: 1,
            title: 'English General A1',
            description: 'Initial A1 course',
            unit_count: 1,
            lesson_count: 1,
            estimated_minutes: 25,
            enrolled: false,
            status: 'draft',
          },
          units: [{
            id: unitId,
            position: 1,
            title: 'Introductions',
            theme: 'People',
            description: 'Meet people',
            estimated_minutes: 25,
            lessons: [{
              id: lessonId,
              lesson_code: 'introductions',
              position: 1,
              lesson_pattern: 'discover',
              title: 'Introduce yourself',
              description: 'Basic introductions',
              estimated_minutes: 25,
              objectives: [{
                id: objectiveId,
                objective_code: 'introduce-yourself',
                description: 'Introduce yourself',
                success_criteria: 'Give your name and ask another person for theirs',
                position: 1,
                required: true,
                skills: ['interaction'],
              }],
              prerequisites: [],
              progress: null,
            }],
          }],
        }
      }
      throw new Error(`Unexpected GET ${path}`)
    },

    async post(path, body) {
      calls.push({ method: 'POST', path, body })
      if (path === '/api/v1/curriculum/editor/import') {
        return {
          state: 'imported',
          course_version_id: versionId,
          package_sha256: 'b'.repeat(64),
          units: 1,
          lessons: 1,
          objectives: 1,
          vocabulary_references: 0,
          sentence_references: 0,
          applied: body.apply,
          dry_run: !body.apply,
        }
      }
      if (path === `/api/v1/curriculum/editor/versions/${versionId}/actions`) {
        const transition = transitions.shift()
        assert.ok(transition, 'no unexpected editorial action should be issued')
        assert.equal(body.action, transition.action)
        return {
          course_version_id: versionId,
          action: transition.action,
          previous_status: transition.previous_status,
          next_status: transition.next_status,
          review_id: `review-${calls.length}`,
          reviewed_at: updatedAt,
        }
      }
      throw new Error(`Unexpected POST ${path}`)
    },

    async request(path, options) {
      calls.push({ method: options.method, path, options })
      assert.equal(path, `/api/v1/curriculum/editor/versions/${versionId}/draft`)
      assert.equal(options.method, 'PUT')
      return {
        course_version_id: versionId,
        updated_at: '2026-11-20 22:45:00+00',
        revision_number: 1,
        content_sha256: 'c'.repeat(64),
      }
    },
  }

  return { http, calls }
}

test('admin web adapter completes queue, import, draft edit, review and publication requests', async () => {
  const { http, calls } = createWorkflowHttp()
  const repository = new BffCurriculumRepository(http)

  const queue = await new GetCurriculumEditorialVersionsUseCase(repository).execute({
    page: 2,
    pageSize: 10,
    status: 'draft',
    search: '  English A1  ',
  })

  assert.equal(queue.total, 21)
  assert.equal(queue.totalPages, 3)
  assert.equal(queue.items[0].courseVersionId, versionId)
  assert.equal(queue.items[0].updatedAt, updatedAt)
  assert.deepEqual(calls[0], {
    method: 'GET',
    path: '/api/v1/curriculum/editor/versions',
    options: {
      query: { page: 2, page_size: 10, status: 'draft', search: 'English A1' },
    },
  })

  const detail = await repository.getCourse(versionId)
  assert.equal(detail.course.title, 'English General A1')
  assert.equal(detail.units[0].lessons[0].objectives[0].successCriteria,
    'Give your name and ask another person for theirs')

  const importer = new ImportCurriculumContentPackageUseCase(repository)
  const packageJson = JSON.stringify({ schema_version: 1, course: { slug: 'english-general-a1' } })
  const preview = await importer.execute({ packageJson, apply: false })
  assert.equal(preview.dryRun, true)
  assert.equal(preview.applied, false)

  const applied = await importer.execute({ packageJson, apply: true })
  assert.equal(applied.applied, true)
  assert.equal(calls[2].path, '/api/v1/curriculum/editor/import')
  assert.deepEqual(calls[2].body, { package_json: packageJson, apply: false })
  assert.deepEqual(calls[3].body, { package_json: packageJson, apply: true })

  const draftJson = JSON.stringify({
    title: 'English General A1 — revised',
    description: 'Updated description',
    units: [{
      id: unitId,
      title: 'Introductions',
      theme: 'People',
      description: 'Meet people',
      estimatedMinutes: 25,
      lessons: [{
        id: lessonId,
        title: 'Introduce yourself',
        description: 'Basic introductions',
        estimatedMinutes: 25,
        objectives: [{
          id: objectiveId,
          description: 'Introduce yourself',
          successCriteria: 'Give your name and ask another person for theirs',
        }],
      }],
    }],
  })
  const saved = await new SaveCurriculumDraftUseCase(repository).execute({
    courseVersionId: versionId,
    expectedUpdatedAt: updatedAt,
    draftJson,
  })
  assert.equal(saved.revisionNumber, 1)
  assert.equal(saved.contentSha256, 'c'.repeat(64))
  assert.deepEqual(calls[4], {
    method: 'PUT',
    path: `/api/v1/curriculum/editor/versions/${versionId}/draft`,
    options: {
      method: 'PUT',
      body: { expected_updated_at: updatedAt, draft_json: draftJson },
      timeoutMs: 180_000,
    },
  })

  const manage = new ManageCurriculumEditorialVersionUseCase(repository)
  const submitted = await manage.execute({ courseVersionId: versionId, action: 'submit' })
  assert.equal(submitted.nextStatus, 'review')

  const changesRequested = await manage.execute({
    courseVersionId: versionId,
    action: 'review',
    decision: 'changes_requested',
    comments: 'Improve the example before approval.',
  })
  assert.equal(changesRequested.nextStatus, 'draft')

  await manage.execute({ courseVersionId: versionId, action: 'submit' })
  const approved = await manage.execute({
    courseVersionId: versionId,
    action: 'review',
    decision: 'approved',
  })
  assert.equal(approved.nextStatus, 'review')

  const published = await manage.execute({ courseVersionId: versionId, action: 'publish' })
  assert.equal(published.nextStatus, 'published')
  assert.equal(calls.filter((call) => call.path.endsWith('/actions')).length, 5)
})

test('editorial review rejects a negative decision without comments before calling the BFF', async () => {
  const { http, calls } = createWorkflowHttp()
  const manage = new ManageCurriculumEditorialVersionUseCase(new BffCurriculumRepository(http))

  await assert.rejects(
    manage.execute({
      courseVersionId: versionId,
      action: 'review',
      decision: 'changes_requested',
      comments: '   ',
    }),
    /requiere comentarios/,
  )
  assert.equal(calls.length, 0)
})

test('a BFF 403 is surfaced as an authorization failure instead of an empty editorial queue', async () => {
  process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.integration.invalid'
  const [{ BffHttpClient }, { TenantIsolationError }] = await Promise.all([
    import('../../src/infrastructure/api/BffHttpClient.ts'),
    import('../../src/domain/errors/DomainError.ts'),
  ])

  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/v1\/curriculum\/editor\/versions/)
    assert.equal(init.method, 'GET')
    assert.equal(init.headers.Authorization, 'Bearer integration-editor-token')
    return new Response(JSON.stringify({
      code: 'CURRICULUM_FORBIDDEN',
      message: 'La cuenta no está registrada en content_editors.',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const session = {
      getAccessToken: () => 'integration-editor-token',
      getTenantId: () => 'tenant-integration',
    }
    const repository = new BffCurriculumRepository(
      new BffHttpClient('https://bff.integration.invalid', session),
    )

    await assert.rejects(
      repository.listEditorialVersions({ page: 1, pageSize: 10 }),
      (error) => error instanceof TenantIsolationError
        && error.message.includes('content_editors'),
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})
