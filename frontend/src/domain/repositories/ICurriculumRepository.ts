export type CurriculumTrackCode = 'general' | 'technology'
export type CurriculumLevel = 'PRE_A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface CurriculumCourseListFilter {
  page: number
  pageSize: number
  trackCode?: CurriculumTrackCode
  cefrLevel?: CurriculumLevel
  search?: string
  enrolledOnly?: boolean
}

export interface CurriculumCoursePage {
  items: CurriculumCourseSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CurriculumCourseSummary {
  courseVersionId: string
  slug: string
  trackCode: CurriculumTrackCode
  cefrLevel: CurriculumLevel
  versionNumber: number
  title: string
  description: string
  unitCount: number
  lessonCount: number
  estimatedMinutes: number
  enrolled: boolean
  status: 'published' | 'archived'
}

export interface CurriculumObjective {
  id: string
  objectiveCode: string
  description: string
  successCriteria: string
  position: number
  required: boolean
  skills: string[]
}

export interface CurriculumPrerequisite {
  prerequisiteLessonId: string
  requiredState: 'completed' | 'mastered'
  minimumMasteryScore: number
}

export type CurriculumLessonProgressState =
  | 'not_enrolled'
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'mastered'

export interface CurriculumLessonProgress {
  state: CurriculumLessonProgressState
  masteryScore: number
  requiredObjectives: number
  completedObjectives: number
  prerequisitesSatisfied: boolean
}

export interface CurriculumLesson {
  id: string
  lessonCode: string
  position: number
  lessonPattern: 'discover' | 'understand' | 'practice' | 'integrate' | 'custom'
  title: string
  description: string
  estimatedMinutes: number
  objectives: CurriculumObjective[]
  prerequisites: CurriculumPrerequisite[]
  progress: CurriculumLessonProgress | null
}

export interface CurriculumUnit {
  id: string
  position: number
  title: string
  theme: string
  description: string
  estimatedMinutes: number
  lessons: CurriculumLesson[]
}

export interface CurriculumCourseDetail {
  course: CurriculumCourseSummary
  units: CurriculumUnit[]
}

export type EditorialVersionStatus = 'draft' | 'review' | 'published' | 'archived'
export type EditorialDecision = 'approved' | 'rejected' | 'changes_requested'
export type EditorialAction = 'submit' | 'review' | 'publish'

export interface EditorialVersionSummary {
  courseVersionId: string
  slug: string
  trackCode: CurriculumTrackCode
  cefrLevel: CurriculumLevel
  versionNumber: number
  status: EditorialVersionStatus
  title: string
  description: string
  importedAt: string
  packageSha256: string
  latestDecision: EditorialDecision | ''
  latestComments: string
  latestReviewerId: string
  canPublish: boolean
  updatedAt: string
}

export interface EditorialVersionsFilter {
  page: number
  pageSize: number
  status?: EditorialVersionStatus
  search?: string
}

export interface EditorialVersionsPage {
  items: EditorialVersionSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface EditorialActionInput {
  courseVersionId: string
  action: EditorialAction
  decision?: EditorialDecision
  comments?: string
}

export interface EditorialActionResult {
  courseVersionId: string
  action: EditorialAction
  previousStatus: EditorialVersionStatus
  nextStatus: EditorialVersionStatus
  reviewId: string
  reviewedAt: string
}

export interface SaveCurriculumDraftInput {
  courseVersionId: string
  expectedUpdatedAt: string
  draftJson: string
}

export interface SaveCurriculumDraftResult {
  courseVersionId: string
  updatedAt: string
  revisionNumber: number
  contentSha256: string
}

export interface ImportCurriculumPackageInput {
  packageJson: string
  apply: boolean
}

export interface ImportCurriculumPackageCounts {
  units: number
  lessons: number
  objectives: number
  vocabularyReferences: number
  sentenceReferences: number
}

export interface ImportCurriculumPackageResult {
  state: 'imported' | 'already_imported'
  courseVersionId: string
  packageSha256: string
  counts: ImportCurriculumPackageCounts
  applied: boolean
  dryRun: boolean
}

export interface CourseEnrollment {
  enrollmentId: string
  courseVersionId: string
  status: 'active' | 'paused' | 'completed' | 'withdrawn'
  startedAt: string
}

export interface ICurriculumRepository {
  listCourses(filter: CurriculumCourseListFilter): Promise<CurriculumCoursePage>
  getCourse(courseVersionId: string): Promise<CurriculumCourseDetail>
  enroll(courseVersionId: string): Promise<CourseEnrollment>
  listEditorialVersions(filter: EditorialVersionsFilter): Promise<EditorialVersionsPage>
  manageEditorialVersion(input: EditorialActionInput): Promise<EditorialActionResult>
  saveCurriculumDraft(input: SaveCurriculumDraftInput): Promise<SaveCurriculumDraftResult>
  importCurriculumPackage(input: ImportCurriculumPackageInput): Promise<ImportCurriculumPackageResult>
}
