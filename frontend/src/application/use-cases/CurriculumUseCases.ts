import type {
  CourseEnrollment,
  CurriculumCourseDetail,
  CurriculumCourseSummary,
  CurriculumLevel,
  ICurriculumRepository,
} from '@/domain/repositories/ICurriculumRepository'

export class GetCurriculumCoursesUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(): Promise<CurriculumCourseSummary[]> {
    return this.repository.listCourses()
  }
}

export class GetCurriculumCourseUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(slug: string, level: CurriculumLevel): Promise<CurriculumCourseDetail> {
    return this.repository.getCourse(slug, level)
  }
}

export class EnrollInCurriculumCourseUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(courseVersionId: string): Promise<CourseEnrollment> {
    if (!courseVersionId.trim()) {
      throw new Error('courseVersionId es obligatorio')
    }
    return this.repository.enroll(courseVersionId)
  }
}
