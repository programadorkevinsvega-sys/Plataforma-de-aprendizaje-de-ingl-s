import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  toCourseEnrollment,
  toCurriculumCourseDetail,
  toCurriculumCourseSummary,
  toEditorialActionResult,
  toEditorialVersionSummary,
  toImportCurriculumPackageResult,
  toSaveCurriculumDraftResult,
} from '../../src/infrastructure/api/curriculumMappers.ts'

test('course summary maps canonical curriculum fields and enrollment state', () => {
  const course = toCurriculumCourseSummary({
    course_version_id: 'version-1',
    slug: 'english-general',
    track_code: 'general',
    cefr_level: 'PRE_A1',
    version_number: 2,
    title: 'English foundations',
    description: 'A first published route',
    unit_count: 3,
    lesson_count: 12,
    estimated_minutes: 180,
    enrolled: true,
    status: 'published',
  })

  assert.equal(course.courseVersionId, 'version-1')
  assert.equal(course.trackCode, 'general')
  assert.equal(course.cefrLevel, 'PRE_A1')
  assert.equal(course.unitCount, 3)
  assert.equal(course.lessonCount, 12)
  assert.equal(course.estimatedMinutes, 180)
  assert.equal(course.enrolled, true)
  assert.equal(course.status, 'published')
})

test('course detail maps nested units, lessons, objectives and prerequisites', () => {
  const detail = toCurriculumCourseDetail({
    course: {
      course_version_id: 'version-1',
      slug: 'english-general',
      track_code: 'general',
      cefr_level: 'A1',
      version_number: 1,
      title: 'English A1',
      description: 'Beginner course',
      unit_count: 1,
      lesson_count: 1,
      estimated_minutes: 20,
      enrolled: false,
      status: 'archived',
    },
    units: [{
      id: 'unit-1',
      position: 1,
      title: 'Introductions',
      theme: 'People',
      description: 'Introduce yourself',
      estimated_minutes: 20,
      lessons: [{
        id: 'lesson-1',
        lesson_code: 'greetings',
        position: 1,
        lesson_pattern: 'discover',
        title: 'Greetings',
        description: 'Use common greetings',
        estimated_minutes: 20,
        objectives: [{
          id: 'objective-1',
          objective_code: 'greet',
          description: 'Greet another person',
          success_criteria: 'Use an appropriate greeting in context',
          position: 1,
          required: true,
          skills: ['vocabulary', 'interaction'],
        }],
        prerequisites: [{
          prerequisite_lesson_id: 'lesson-0',
          required_state: 'completed',
          minimum_mastery_score: 0.8,
        }],
        progress: {
          state: 'locked',
          mastery_score: 1.4,
          required_objectives: 2,
          completed_objectives: 1,
          prerequisites_satisfied: false,
        },
      }],
    }],
  })

  assert.equal(detail.course.title, 'English A1')
  assert.equal(detail.course.status, 'archived')
  assert.equal(detail.units[0].lessons[0].lessonPattern, 'discover')
  assert.deepEqual(detail.units[0].lessons[0].objectives[0].skills, [
    'vocabulary',
    'interaction',
  ])
  assert.equal(
    detail.units[0].lessons[0].prerequisites[0].prerequisiteLessonId,
    'lesson-0',
  )
  assert.equal(
    detail.units[0].lessons[0].prerequisites[0].minimumMasteryScore,
    0.8,
  )
  assert.equal(detail.units[0].lessons[0].progress?.state, 'locked')
  assert.equal(detail.units[0].lessons[0].progress?.masteryScore, 1)
  assert.equal(detail.units[0].lessons[0].progress?.completedObjectives, 1)
})

test('course enrollment maps response and falls back safely for unknown status', () => {
  const enrollment = toCourseEnrollment({
    enrollment_id: 'enrollment-1',
    course_version_id: 'version-1',
    status: 'active',
    started_at: '2026-11-18T12:00:00Z',
  })

  assert.equal(enrollment.enrollmentId, 'enrollment-1')
  assert.equal(enrollment.courseVersionId, 'version-1')
  assert.equal(enrollment.status, 'active')
  assert.equal(enrollment.startedAt, '2026-11-18T12:00:00Z')

  assert.equal(toCourseEnrollment({ status: 'unexpected' }).status, 'active')
})

test('invalid detail responses fail instead of creating a fake course', () => {
  assert.throws(
    () => toCurriculumCourseDetail({ units: [] }),
    /no contiene el curso/,
  )
})


test('editorial version mapper exposes immutable version and latest review state', () => {
  const version = toEditorialVersionSummary({
    course_version_id: 'version-2',
    slug: 'english-general',
    track_code: 'general',
    cefr_level: 'A2',
    version_number: 2,
    status: 'review',
    title: 'English A2',
    description: 'Second level',
    imported_at: '2026-11-18T10:00:00Z',
    package_sha256: 'a'.repeat(64),
    latest_decision: 'approved',
    latest_comments: 'Ready to publish',
    latest_reviewer_id: 'editor-1',
    can_publish: true,
    updated_at: '2026-11-20 17:17:00+00',
  })

  assert.equal(version.courseVersionId, 'version-2')
  assert.equal(version.status, 'review')
  assert.equal(version.latestDecision, 'approved')
  assert.equal(version.canPublish, true)
  assert.equal(version.updatedAt, '2026-11-20 17:17:00+00')
  assert.equal(version.packageSha256.length, 64)
})

test('editorial action mapper retains previous and resulting lifecycle states', () => {
  const action = toEditorialActionResult({
    course_version_id: 'version-2',
    action: 'publish',
    previous_status: 'review',
    next_status: 'published',
    review_id: '',
    reviewed_at: '',
  })

  assert.equal(action.action, 'publish')
  assert.equal(action.previousStatus, 'review')
  assert.equal(action.nextStatus, 'published')
})

test('package import mapper distinguishes dry-run from persisted draft', () => {
  const preview = toImportCurriculumPackageResult({
    state: 'imported',
    course_version_id: 'preview-id',
    package_sha256: 'b'.repeat(64),
    units: 2,
    lessons: 8,
    objectives: 10,
    vocabulary_references: 12,
    sentence_references: 6,
    applied: false,
    dry_run: true,
  })

  assert.equal(preview.dryRun, true)
  assert.equal(preview.applied, false)
  assert.equal(preview.counts.lessons, 8)
  assert.equal(preview.counts.vocabularyReferences, 12)

  const applied = toImportCurriculumPackageResult({
    state: 'imported',
    course_version_id: 'persistent-id',
    package_sha256: 'b'.repeat(64),
    units: 2,
    lessons: 8,
    objectives: 10,
    vocabulary_references: 12,
    sentence_references: 6,
    applied: true,
    dry_run: false,
  })
  assert.equal(applied.applied, true)
  assert.equal(applied.dryRun, false)
})

test('draft save mapper exposes revision number and content integrity hash', () => {
  const saved = toSaveCurriculumDraftResult({
    course_version_id: 'version-2',
    updated_at: '2026-11-20 17:20:00+00',
    revision_number: 3,
    content_sha256: 'c'.repeat(64),
  })

  assert.equal(saved.courseVersionId, 'version-2')
  assert.equal(saved.updatedAt, '2026-11-20 17:20:00+00')
  assert.equal(saved.revisionNumber, 3)
  assert.equal(saved.contentSha256, 'c'.repeat(64))
})
