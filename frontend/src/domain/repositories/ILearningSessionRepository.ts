import type {
  ActivityAttemptResult,
  ActivitySubmission,
  StudentActivityView,
} from '@/domain/entities/Activity'

export type LearningSessionStatus = 'in_progress' | 'completed' | 'pending_review' | 'abandoned'

export interface LearningSession {
  sessionId: string
  lessonId: string
  lessonTitle: string
  courseVersionId: string
  status: LearningSessionStatus
  currentActivityPosition: number
  totalActivities: number
  activeDurationMs: number
  activity: StudentActivityView | null
  lastResult: ActivityAttemptResult | null
  completedAt: string | null
  remainingAttempts: number
}

export interface StartLearningSessionResult {
  session: LearningSession
  resumedExisting: boolean
}

export interface SubmitLearningActivityResult {
  session: LearningSession
  result: ActivityAttemptResult
  idempotentReplay: boolean
  rewardPending: boolean
}

export interface ILearningSessionRepository {
  startLesson(lessonId: string, idempotencyKey: string): Promise<StartLearningSessionResult>
  getSession(sessionId: string): Promise<LearningSession>
  submitActivity(
    sessionId: string,
    activity: StudentActivityView,
    submission: ActivitySubmission,
  ): Promise<SubmitLearningActivityResult>
}
