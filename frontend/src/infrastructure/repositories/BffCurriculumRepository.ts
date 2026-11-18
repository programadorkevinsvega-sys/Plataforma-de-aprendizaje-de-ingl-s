import type {
  CourseEnrollment,
  CurriculumCourseDetail,
  CurriculumCoursePage,
  CurriculumCourseQuery,
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

  async listCourses(query: CurriculumCourseQuery): Promise<CurriculumCoursePage> {
    const params = new URLSearchParams({
      limit: String(query.limit),
      offset: String(query.offset),
    })
    if (query.track) params.set('track', query.track)
    if (query.level) params.set('level', query.level)
    if (query.search?.trim()) params.set('search', query.search.trim())

    const response = await this.http.get<Dto>(
      `/api/v1/curriculum/courses?${params.toString()}`,
    )
    const items = Array.isArray(response.items) ? (response.items as Dto[]) : []
    return {
      items: items.map(toCurriculumCourseSummary),
      total: Number(response.total ?? 0),
      limit: Number(response.limit ?? query.limit),
      offset: Number(response.offset ?? query.offset),
    }
  }

  async getCourse(courseVersionId: string): Promise<CurriculumCourseDetail> {
    const response = await this.http.get<Dto>(
      `/api/v1/curriculum/courses/${encodeURIComponent(courseVersionId)}`,
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
