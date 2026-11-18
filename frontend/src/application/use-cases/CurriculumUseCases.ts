import type {
  CourseEnrollment,
  CurriculumCourseDetail,
  CurriculumCourseListFilter,
  CurriculumCoursePage,
  ICurriculumRepository,
} from '@/domain/repositories/ICurriculumRepository'

export class GetCurriculumCoursesUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(filter: CurriculumCourseListFilter): Promise<CurriculumCoursePage> {
    return this.repository.listCourses(filter)
  }
}

export class GetCurriculumCourseUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(courseVersionId: string): Promise<CurriculumCourseDetail> {
    return this.repository.getCourse(courseVersionId)
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
