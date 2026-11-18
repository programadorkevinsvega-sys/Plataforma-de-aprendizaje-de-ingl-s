import type {
  CourseEnrollment,
  EditorialCourseVersion,
  EditorialAction,
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

  async listEditorialVersions(status = ''): Promise<EditorialCourseVersion[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : ''
    const response = await this.http.get<Dto>(`/api/v1/admin/curriculum/versions${suffix}`)
    const items = Array.isArray(response.items) ? (response.items as Dto[]) : []
    return items.map((item) => ({
      courseVersionId: String(item.course_version_id ?? ''),
      slug: String(item.slug ?? ''),
      trackCode: item.track_code === 'technology' ? 'technology' : 'general',
      cefrLevel: String(item.cefr_level ?? 'PRE_A1') as EditorialCourseVersion['cefrLevel'],
      versionNumber: Number(item.version_number ?? 0),
      title: String(item.title ?? ''),
      description: String(item.description ?? ''),
      status: String(item.status ?? 'draft') as EditorialCourseVersion['status'],
      submittedAt: String(item.submitted_at ?? ''),
      publishedAt: String(item.published_at ?? ''),
      latestDecision: String(item.latest_decision ?? '') as EditorialCourseVersion['latestDecision'],
      latestComments: String(item.latest_comments ?? ''),
    }))
  }

  async applyEditorialAction(action: EditorialAction): Promise<void> {
    await this.http.post<Dto>('/api/v1/admin/curriculum/actions', {
      course_version_id: action.courseVersionId,
      action: action.action,
      decision: action.decision,
      comments: action.comments,
    })
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
