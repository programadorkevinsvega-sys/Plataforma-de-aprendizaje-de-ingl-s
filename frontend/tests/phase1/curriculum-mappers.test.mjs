import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  toCourseEnrollment,
  toCurriculumCourseDetail,
  toCurriculumCourseSummary,
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
  })

  assert.equal(course.courseVersionId, 'version-1')
  assert.equal(course.trackCode, 'general')
  assert.equal(course.cefrLevel, 'PRE_A1')
  assert.equal(course.unitCount, 3)
  assert.equal(course.lessonCount, 12)
  assert.equal(course.estimatedMinutes, 180)
  assert.equal(course.enrolled, true)
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
      }],
    }],
  })

  assert.equal(detail.course.title, 'English A1')
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
