import type {
  CourseEnrollment,
  CurriculumCourseDetail,
  CurriculumCourseSummary,
  CurriculumLevel,
  ICurriculumRepository,
} from '@/domain/repositories/ICurriculumRepository'
import type { BffHttpClient } from '@/infrastructure/api/BffHttpClient'
import {
  toCourseEnrollment,
  toCurriculumCourseDetail,
  toCurriculumCourseSummary,
} from '@/infrastructure/api/curriculumMappers'

type Dto = Record<string, unknown>

export class BffCurriculumRepository implements ICurriculumRepository {
  constructor(private readonly http: BffHttpClient) {}

  async listCourses(): Promise<CurriculumCourseSummary[]> {
    const response = await this.http.get<Dto>('/api/v1/curriculum/courses')
    const items = Array.isArray(response.items) ? (response.items as Dto[]) : []
    return items.map(toCurriculumCourseSummary)
  }

  async getCourse(
    slug: string,
    level: CurriculumLevel,
  ): Promise<CurriculumCourseDetail> {
    const response = await this.http.get<Dto>(
      `/api/v1/curriculum/courses/${encodeURIComponent(slug)}/${encodeURIComponent(level)}`,
    )
    return toCurriculumCourseDetail(response)
  }

  async enroll(courseVersionId: string): Promise<CourseEnrollment> {
    const response = await this.http.post<Dto>('/api/v1/curriculum/enrollments', {
      course_version_id: courseVersionId,
    })
    return toCourseEnrollment(response)
  }
}
