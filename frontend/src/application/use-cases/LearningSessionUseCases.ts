import type {
  ActivitySubmission,
  RevealedHint,
  StudentActivityView,
} from '@/domain/entities/Activity'
import type {
  ILearningSessionRepository,
  LearningSession,
  StartLearningSessionResult,
  SubmitLearningActivityResult,
} from '@/domain/repositories/ILearningSessionRepository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class StartLessonSessionUseCase {
  constructor(private readonly repository: ILearningSessionRepository) {}

  execute(lessonId: string, idempotencyKey: string): Promise<StartLearningSessionResult> {
    if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(idempotencyKey)) {
      throw new Error('La lección y la clave de inicio deben ser UUID válidos.')
    }
    return this.repository.startLesson(lessonId, idempotencyKey)
  }
}

export class GetLearningSessionUseCase {
  constructor(private readonly repository: ILearningSessionRepository) {}

  execute(sessionId: string): Promise<LearningSession> {
    if (!UUID_PATTERN.test(sessionId)) throw new Error('El identificador de sesión no es válido.')
    return this.repository.getSession(sessionId)
  }
}

export class RevealLearningHintUseCase {
  constructor(private readonly repository: ILearningSessionRepository) {}

  execute(sessionId: string, hintOrder: number): Promise<RevealedHint> {
    if (!UUID_PATTERN.test(sessionId)) throw new Error('El identificador de sesión no es válido.')
    if (!Number.isInteger(hintOrder) || hintOrder < 1 || hintOrder > 8) {
      throw new Error('El orden de la pista debe estar entre uno y ocho.')
    }
    return this.repository.revealHint(sessionId, hintOrder)
  }
}

export class SubmitLearningActivityUseCase {
  constructor(private readonly repository: ILearningSessionRepository) {}

  execute(
    sessionId: string,
    activity: StudentActivityView,
    submission: ActivitySubmission,
  ): Promise<SubmitLearningActivityResult> {
    if (!UUID_PATTERN.test(sessionId)) throw new Error('El identificador de sesión no es válido.')
    if (submission.activityId !== activity.activityId || submission.activityVersion !== activity.activityVersion) {
      throw new Error('La respuesta no corresponde a la actividad actual.')
    }
    return this.repository.submitActivity(sessionId, activity, submission)
  }
}
