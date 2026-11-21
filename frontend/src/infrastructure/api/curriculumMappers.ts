import type {
  CourseEnrollment,
  EditorialActionResult,
  EditorialDecision,
  EditorialVersionStatus,
  ImportCurriculumPackageResult,
  SaveCurriculumDraftResult,
  EditorialVersionSummary,
  CurriculumCourseDetail,
  CurriculumCourseSummary,
  CurriculumLevel,
  CurriculumLesson,
  CurriculumLessonProgress,
  CurriculumLessonProgressState,
  CurriculumObjective,
  CurriculumPrerequisite,
  CurriculumTrackCode,
  CurriculumUnit,
} from '@/domain/repositories/ICurriculumRepository'

type Dto = Record<string, unknown>

function value(dto: Dto, ...keys: string[]): unknown {
  for (const key of keys) {
    if (dto[key] !== undefined && dto[key] !== null) return dto[key]
  }
  return undefined
}

function stringValue(dto: Dto, keys: string[], fallback = ''): string {
  const raw = value(dto, ...keys)
  return typeof raw === 'string' ? raw : raw == null ? fallback : String(raw)
}

function numberValue(dto: Dto, keys: string[], fallback = 0): number {
  const raw = value(dto, ...keys)
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanValue(dto: Dto, keys: string[], fallback = false): boolean {
  const raw = value(dto, ...keys)
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 1) return true
  if (raw === 'false' || raw === 0) return false
  return fallback
}

function records(dto: Dto, ...keys: string[]): Dto[] {
  const raw = value(dto, ...keys)
  return Array.isArray(raw)
    ? raw.filter((item): item is Dto => typeof item === 'object' && item !== null)
    : []
}

function mapTrack(value: string): CurriculumTrackCode {
  return value === 'technology' ? 'technology' : 'general'
}

function mapLevel(value: string): CurriculumLevel {
  const levels: CurriculumLevel[] = ['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  return levels.includes(value as CurriculumLevel) ? (value as CurriculumLevel) : 'PRE_A1'
}

export function toCurriculumCourseSummary(dto: Dto): CurriculumCourseSummary {
  return {
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    slug: stringValue(dto, ['slug']),
    trackCode: mapTrack(stringValue(dto, ['track_code', 'trackCode'])),
    cefrLevel: mapLevel(stringValue(dto, ['cefr_level', 'cefrLevel'], 'PRE_A1')),
    versionNumber: numberValue(dto, ['version_number', 'versionNumber']),
    title: stringValue(dto, ['title']),
    description: stringValue(dto, ['description']),
    unitCount: numberValue(dto, ['unit_count', 'unitCount']),
    lessonCount: numberValue(dto, ['lesson_count', 'lessonCount']),
    estimatedMinutes: numberValue(dto, ['estimated_minutes', 'estimatedMinutes']),
    enrolled: booleanValue(dto, ['enrolled']),
    status: stringValue(dto, ['status']) === 'archived' ? 'archived' : 'published',
  }
}

function toObjective(dto: Dto): CurriculumObjective {
  const skills = value(dto, 'skills')
  return {
    id: stringValue(dto, ['id']),
    objectiveCode: stringValue(dto, ['objective_code', 'objectiveCode']),
    description: stringValue(dto, ['description']),
    successCriteria: stringValue(dto, ['success_criteria', 'successCriteria']),
    position: numberValue(dto, ['position']),
    required: booleanValue(dto, ['required'], true),
    skills: Array.isArray(skills)
      ? skills.filter((skill): skill is string => typeof skill === 'string')
      : [],
  }
}

function toPrerequisite(dto: Dto): CurriculumPrerequisite {
  const requiredState = stringValue(dto, ['required_state', 'requiredState'])
  return {
    prerequisiteLessonId: stringValue(dto, [
      'prerequisite_lesson_id',
      'prerequisiteLessonId',
      'lesson_id',
    ]),
    requiredState: requiredState === 'mastered' ? 'mastered' : 'completed',
    minimumMasteryScore: numberValue(dto, [
      'minimum_mastery_score',
      'minimumMasteryScore',
    ]),
  }
}

function toLesson(dto: Dto): CurriculumLesson {
  const pattern = stringValue(dto, ['lesson_pattern', 'lessonPattern'])
  const rawProgress = value(dto, 'progress')
  let progress: CurriculumLessonProgress | null = null
  if (typeof rawProgress === 'object' && rawProgress !== null) {
    const progressDto = rawProgress as Dto
    const rawState = stringValue(progressDto, ['state'])
    const allowedStates: CurriculumLessonProgressState[] = [
      'not_enrolled',
      'locked',
      'available',
      'in_progress',
      'completed',
      'mastered',
    ]
    progress = {
      state: allowedStates.includes(rawState as CurriculumLessonProgressState)
        ? (rawState as CurriculumLessonProgressState)
        : 'locked',
      masteryScore: Math.min(1, Math.max(0, numberValue(progressDto, ['mastery_score', 'masteryScore']))),
      requiredObjectives: numberValue(progressDto, ['required_objectives', 'requiredObjectives']),
      completedObjectives: numberValue(progressDto, ['completed_objectives', 'completedObjectives']),
      prerequisitesSatisfied: booleanValue(progressDto, ['prerequisites_satisfied', 'prerequisitesSatisfied']),
    }
  }
  const allowed: CurriculumLesson['lessonPattern'][] = [
    'discover',
    'understand',
    'practice',
    'integrate',
    'custom',
  ]
  return {
    id: stringValue(dto, ['id']),
    lessonCode: stringValue(dto, ['lesson_code', 'lessonCode']),
    position: numberValue(dto, ['position']),
    lessonPattern: allowed.includes(pattern as CurriculumLesson['lessonPattern'])
      ? (pattern as CurriculumLesson['lessonPattern'])
      : 'custom',
    title: stringValue(dto, ['title']),
    description: stringValue(dto, ['description']),
    estimatedMinutes: numberValue(dto, ['estimated_minutes', 'estimatedMinutes']),
    activityCount: numberValue(dto, ['activity_count', 'activityCount']),
    objectives: records(dto, 'objectives').map(toObjective),
    prerequisites: records(dto, 'prerequisites').map(toPrerequisite),
    progress,
  }
}

function toUnit(dto: Dto): CurriculumUnit {
  return {
    id: stringValue(dto, ['id']),
    position: numberValue(dto, ['position']),
    title: stringValue(dto, ['title']),
    theme: stringValue(dto, ['theme']),
    description: stringValue(dto, ['description']),
    estimatedMinutes: numberValue(dto, ['estimated_minutes', 'estimatedMinutes']),
    lessons: records(dto, 'lessons').map(toLesson),
  }
}

export function toCurriculumCourseDetail(dto: Dto): CurriculumCourseDetail {
  const course = value(dto, 'course')
  if (typeof course !== 'object' || course === null) {
    throw new Error('La respuesta curricular no contiene el curso')
  }
  return {
    course: toCurriculumCourseSummary(course as Dto),
    units: records(dto, 'units').map(toUnit),
  }
}

export function toEditorialVersionSummary(dto: Dto): EditorialVersionSummary {
  const status = stringValue(dto, ['status'])
  const decision = stringValue(dto, ['latest_decision', 'latestDecision'])
  const statuses: EditorialVersionStatus[] = ['draft', 'review', 'published', 'archived']
  const decisions: EditorialDecision[] = ['approved', 'rejected', 'changes_requested']
  return {
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    slug: stringValue(dto, ['slug']),
    trackCode: mapTrack(stringValue(dto, ['track_code', 'trackCode'])),
    cefrLevel: mapLevel(stringValue(dto, ['cefr_level', 'cefrLevel'], 'PRE_A1')),
    versionNumber: numberValue(dto, ['version_number', 'versionNumber']),
    status: statuses.includes(status as EditorialVersionStatus)
      ? (status as EditorialVersionStatus)
      : 'draft',
    title: stringValue(dto, ['title']),
    description: stringValue(dto, ['description']),
    importedAt: stringValue(dto, ['imported_at', 'importedAt']),
    packageSha256: stringValue(dto, ['package_sha256', 'packageSha256']),
    latestDecision: decisions.includes(decision as EditorialDecision)
      ? (decision as EditorialDecision)
      : '',
    latestComments: stringValue(dto, ['latest_comments', 'latestComments']),
    latestReviewerId: stringValue(dto, ['latest_reviewer_id', 'latestReviewerId']),
    canPublish: booleanValue(dto, ['can_publish', 'canPublish']),
    updatedAt: stringValue(dto, ['updated_at', 'updatedAt']),
  }
}

export function toSaveCurriculumDraftResult(dto: Dto): SaveCurriculumDraftResult {
  return {
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    updatedAt: stringValue(dto, ['updated_at', 'updatedAt']),
    revisionNumber: numberValue(dto, ['revision_number', 'revisionNumber']),
    contentSha256: stringValue(dto, ['content_sha256', 'contentSha256']),
  }
}

export function toEditorialActionResult(dto: Dto): EditorialActionResult {
  const action = stringValue(dto, ['action'])
  const previousStatus = stringValue(dto, ['previous_status', 'previousStatus'])
  const nextStatus = stringValue(dto, ['next_status', 'nextStatus'])
  const statuses: EditorialVersionStatus[] = ['draft', 'review', 'published', 'archived']
  return {
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    action: action === 'review' || action === 'publish' ? action : 'submit',
    previousStatus: statuses.includes(previousStatus as EditorialVersionStatus)
      ? (previousStatus as EditorialVersionStatus)
      : 'draft',
    nextStatus: statuses.includes(nextStatus as EditorialVersionStatus)
      ? (nextStatus as EditorialVersionStatus)
      : 'draft',
    reviewId: stringValue(dto, ['review_id', 'reviewId']),
    reviewedAt: stringValue(dto, ['reviewed_at', 'reviewedAt']),
  }
}

export function toImportCurriculumPackageResult(dto: Dto): ImportCurriculumPackageResult {
  const state = stringValue(dto, ['state'])
  return {
    state: state === 'already_imported' ? 'already_imported' : 'imported',
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    packageSha256: stringValue(dto, ['package_sha256', 'packageSha256']),
    counts: {
      units: numberValue(dto, ['units']),
      lessons: numberValue(dto, ['lessons']),
      objectives: numberValue(dto, ['objectives']),
      vocabularyReferences: numberValue(dto, ['vocabulary_references', 'vocabularyReferences']),
      sentenceReferences: numberValue(dto, ['sentence_references', 'sentenceReferences']),
    },
    applied: booleanValue(dto, ['applied']),
    dryRun: booleanValue(dto, ['dry_run', 'dryRun']),
  }
}

export function toCourseEnrollment(dto: Dto): CourseEnrollment {
  const status = stringValue(dto, ['status'])
  const allowed: CourseEnrollment['status'][] = [
    'active',
    'paused',
    'completed',
    'withdrawn',
  ]
  return {
    enrollmentId: stringValue(dto, ['enrollment_id', 'enrollmentId']),
    courseVersionId: stringValue(dto, ['course_version_id', 'courseVersionId']),
    status: allowed.includes(status as CourseEnrollment['status'])
      ? (status as CourseEnrollment['status'])
      : 'active',
    startedAt: stringValue(dto, ['started_at', 'startedAt']),
  }
}
