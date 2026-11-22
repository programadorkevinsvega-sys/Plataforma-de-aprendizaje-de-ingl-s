import type {
  ActivityAttemptResult,
  ActivitySubmission,
  RevealedHint,
  StudentActivityView,
} from '@/domain/entities/Activity'
import {
  parseActivityAttemptResult,
  parseRevealedHint,
  parseStudentActivityView,
} from '@/domain/entities/Activity'
import type {
  ILearningSessionRepository,
  LearningSession,
  LearningSessionStatus,
  StartLearningSessionResult,
  SubmitLearningActivityResult,
} from '@/domain/repositories/ILearningSessionRepository'
import type { BffHttpClient } from '@/infrastructure/api/BffHttpClient'

type Dto = Record<string, unknown>

function record(value: unknown, path: string): Dto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Respuesta de sesión inválida: ' + path)
  }
  return value as Dto
}

function stringField(dto: Dto, key: string): string {
  const value = dto[key]
  if (typeof value !== 'string') throw new Error('Respuesta de sesión inválida: ' + key)
  return value
}

function numberField(dto: Dto, key: string): number {
  const value = dto[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Respuesta de sesión inválida: ' + key)
  }
  return value
}

function optionalResult(value: unknown, activity: StudentActivityView | null): ActivityAttemptResult | null {
  if (!activity || value == null) return null
  const candidate = record(value, 'last_result')
  if (
    candidate.activityId !== activity.activityId ||
    candidate.activityVersion !== activity.activityVersion
  ) {
    return null
  }
  return parseActivityAttemptResult(candidate, activity)
}

function parseSession(value: unknown): LearningSession {
  const dto = record(value, 'session')
  const status = stringField(dto, 'status')
  const allowed: LearningSessionStatus[] = ['in_progress', 'completed', 'pending_review', 'abandoned']
  if (!allowed.includes(status as LearningSessionStatus)) {
    throw new Error('La sesión devolvió un estado desconocido.')
  }

  const rawActivity = dto.activity
  const activity = rawActivity == null ? null : parseStudentActivityView(rawActivity)
  if (status === 'in_progress' && !activity) {
    throw new Error('La sesión activa no contiene una actividad pública.')
  }

  const activeDurationMs = numberField(dto, 'active_duration_ms')
  const currentActivityPosition = numberField(dto, 'current_activity_position')
  const totalActivities = numberField(dto, 'total_activities')
  const remainingAttempts = numberField(dto, 'remaining_attempts')
  const rawRevealedHints = dto.revealed_hints
  if (rawRevealedHints != null && !Array.isArray(rawRevealedHints)) {
    throw new Error('La sesión contiene pistas desbloqueadas inválidas.')
  }
  const revealedHints = (rawRevealedHints ?? []).map(parseRevealedHint)
  if (
    revealedHints.length > 8 ||
    (activity === null && revealedHints.length > 0) ||
    new Set(revealedHints.map((hint) => hint.hintId)).size !== revealedHints.length ||
    revealedHints.some((hint, index) =>
      hint.order !== index + 1 || hint.hintId !== activity?.availableHints[index]?.hintId
    )
  ) {
    throw new Error('La sesión contiene pistas fuera de orden o ajenas a la actividad.')
  }
  if (
    activeDurationMs < 0 ||
    currentActivityPosition < 1 ||
    totalActivities < 1 ||
    currentActivityPosition > totalActivities + 1 ||
    remainingAttempts < 0
  ) {
    throw new Error('La sesión contiene límites de progreso inválidos.')
  }

  return {
    sessionId: stringField(dto, 'session_id'),
    lessonId: stringField(dto, 'lesson_id'),
    lessonTitle: stringField(dto, 'lesson_title'),
    courseVersionId: stringField(dto, 'course_version_id'),
    status: status as LearningSessionStatus,
    currentActivityPosition,
    totalActivities,
    activeDurationMs,
    activity,
    lastResult: optionalResult(dto.last_result, activity),
    completedAt: typeof dto.completed_at === 'string' ? dto.completed_at : null,
    remainingAttempts,
    rewardPending: false,
    revealedHints,
  }
}

function parseResponse(value: unknown): Dto {
  return record(value, 'response')
}

export class BffLearningSessionRepository implements ILearningSessionRepository {
  constructor(private readonly http: BffHttpClient) {}

  async startLesson(lessonId: string, idempotencyKey: string): Promise<StartLearningSessionResult> {
    const dto = parseResponse(await this.http.post<unknown>(
      '/api/v1/curriculum/lessons/' + encodeURIComponent(lessonId) + '/sessions',
      { idempotency_key: idempotencyKey },
      { timeoutMs: 90_000 },
    ))
    return {
      session: parseSession(dto.session),
      resumedExisting: dto.resumed_existing === true,
    }
  }

  async getSession(sessionId: string): Promise<LearningSession> {
    const dto = parseResponse(await this.http.get<unknown>(
      '/api/v1/learning/sessions/' + encodeURIComponent(sessionId),
      { timeoutMs: 45_000 },
    ))
    const session = parseSession(dto.session)
    return { ...session, rewardPending: dto.reward_pending === true }
  }

  async revealHint(sessionId: string, hintOrder: number): Promise<RevealedHint> {
    if (!Number.isInteger(hintOrder) || hintOrder < 1 || hintOrder > 8) {
      throw new Error('El orden de la pista no es válido.')
    }
    const dto = parseResponse(await this.http.post<unknown>(
      '/api/v1/learning/sessions/' + encodeURIComponent(sessionId) + '/hints',
      { hint_order: hintOrder },
      { timeoutMs: 30_000 },
    ))
    const hint = parseRevealedHint(dto)
    if (hint.order !== hintOrder) {
      throw new Error('El servidor devolvió una pista fuera de orden.')
    }
    return hint
  }

  async submitActivity(
    sessionId: string,
    activity: StudentActivityView,
    submission: ActivitySubmission,
  ): Promise<SubmitLearningActivityResult> {
    const dto = parseResponse(await this.http.post<unknown>(
      '/api/v1/learning/sessions/' + encodeURIComponent(sessionId) + '/answers',
      submission,
      { timeoutMs: 180_000 },
    ))
    const result = parseActivityAttemptResult(dto.result, activity)
    return {
      session: {
        ...parseSession(dto.session),
        rewardPending: dto.reward_pending === true,
      },
      result,
      idempotentReplay: dto.idempotent_replay === true,
      rewardPending: dto.reward_pending === true,
    }
  }
}
