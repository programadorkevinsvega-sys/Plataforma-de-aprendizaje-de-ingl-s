export type CurriculumTrackCode = 'general' | 'technology'
export type CurriculumLevel = 'PRE_A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

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

export interface CourseEnrollment {
  enrollmentId: string
  courseVersionId: string
  status: 'active' | 'paused' | 'completed' | 'withdrawn'
  startedAt: string
}

export interface ICurriculumRepository {
  listCourses(): Promise<CurriculumCourseSummary[]>
  getCourse(slug: string, level: CurriculumLevel): Promise<CurriculumCourseDetail>
  enroll(courseVersionId: string): Promise<CourseEnrollment>
}
