import type {
  CourseEnrollment,
  EditorialActionInput,
  EditorialActionResult,
  EditorialVersionsFilter,
  EditorialVersionsPage,
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

export class GetCurriculumEditorialVersionsUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(filter: EditorialVersionsFilter): Promise<EditorialVersionsPage> {
    return this.repository.listEditorialVersions(filter)
  }
}

export class ManageCurriculumEditorialVersionUseCase {
  constructor(private readonly repository: ICurriculumRepository) {}

  execute(input: EditorialActionInput): Promise<EditorialActionResult> {
    if (!input.courseVersionId.trim()) {
      throw new Error('courseVersionId es obligatorio')
    }
    if (input.action === 'review') {
      if (!input.decision) throw new Error('La decisión editorial es obligatoria')
      if (input.decision !== 'approved' && !input.comments?.trim()) {
        throw new Error('Rechazar o solicitar cambios requiere comentarios')
      }
    }
    return this.repository.manageEditorialVersion(input)
  }
}
