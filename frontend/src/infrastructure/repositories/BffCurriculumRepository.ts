import type {
  CourseEnrollment,
  CurriculumCourseDetail,
  CurriculumCourseListFilter,
  CurriculumCoursePage,
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

  async listCourses(filter: CurriculumCourseListFilter): Promise<CurriculumCoursePage> {
    const response = await this.http.get<Dto>('/api/v1/curriculum/courses', {
      query: {
        page: filter.page,
        page_size: filter.pageSize,
        track_code: filter.trackCode,
        cefr_level: filter.cefrLevel,
        search: filter.search?.trim(),
        enrolled_only: filter.enrolledOnly,
      },
    })
    const items = Array.isArray(response.items) ? (response.items as Dto[]) : []
    return {
      items: items.map(toCurriculumCourseSummary),
      total: Number(response.total ?? 0),
      page: Number(response.page ?? filter.page),
      pageSize: Number(response.page_size ?? filter.pageSize),
      totalPages: Number(response.total_pages ?? 0),
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
