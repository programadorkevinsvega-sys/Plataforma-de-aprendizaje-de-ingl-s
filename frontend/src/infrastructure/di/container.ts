/**
 * Contenedor de Inyección de Dependencias.
 *
 * Único lugar donde las interfaces del dominio se enlazan con los adaptadores
 * concretos del BFF. La capa de presentación consume casos de uso desde aquí y
 * jamás importa un repositorio de infraestructura de forma directa.
 */
import {
  EvaluateExamAnswerUseCase,
  GetInterviewQuestionUseCase,
  GetWeaknessDrillUseCase,
  TranscribeAnswerUseCase,
} from '@/application/use-cases/EvaluateExamAnswerUseCase'
import { GetAchievementsUseCase } from '@/application/use-cases/GetAchievementsUseCase'
import { GetDashboardSummaryUseCase } from '@/application/use-cases/GetDashboardSummaryUseCase'
import { GetLeaderboardUseCase } from '@/application/use-cases/GetLeaderboardUseCase'
import {
  GetTodayLessonUseCase,
  GetVocabularyListUseCase,
  MarkWordCompletedUseCase,
  SynthesizeSpeechUseCase,
} from '@/application/use-cases/GetVocabularyListUseCase'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase'
import {
  GetDueCardsUseCase,
  ReviewSrsCardUseCase,
} from '@/application/use-cases/ReviewSrsCardUseCase'
import {
  GetCurrentUserUseCase,
  LogoutUserUseCase,
  UpdateProfileUseCase,
} from '@/application/use-cases/SessionUseCases'
import type { IAIEvaluatorRepository } from '@/domain/repositories/IAIEvaluatorRepository'
import type { IAuthRepository } from '@/domain/repositories/IAuthRepository'
import type { IContentRepository } from '@/domain/repositories/IContentRepository'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'
import type { ISrsRepository } from '@/domain/repositories/ISrsRepository'
import { BFF_BASE_URL, BffHttpClient } from '../api/BffHttpClient'
import { BffAIEvaluatorRepository } from '../repositories/BffAIEvaluatorRepository'
import { BffAuthRepository } from '../repositories/BffAuthRepository'
import { BffContentRepository } from '../repositories/BffContentRepository'
import { BffProgressRepository } from '../repositories/BffProgressRepository'
import { BffSrsRepository } from '../repositories/BffSrsRepository'
import { sessionStorageAdapter } from '../storage/SessionStorage'

export interface Container {
  bffBaseUrl: string
  session: typeof sessionStorageAdapter
  repositories: {
    auth: IAuthRepository
    content: IContentRepository
    evaluator: IAIEvaluatorRepository
    srs: ISrsRepository
    progress: IProgressRepository
  }
  useCases: {
    register: RegisterUserUseCase
    login: LoginUserUseCase
    logout: LogoutUserUseCase
    getCurrentUser: GetCurrentUserUseCase
    updateProfile: UpdateProfileUseCase
    getVocabulary: GetVocabularyListUseCase
    getTodayLesson: GetTodayLessonUseCase
    synthesizeSpeech: SynthesizeSpeechUseCase
    markWordCompleted: MarkWordCompletedUseCase
    getInterviewQuestion: GetInterviewQuestionUseCase
    evaluateAnswer: EvaluateExamAnswerUseCase
    getWeaknessDrill: GetWeaknessDrillUseCase
    transcribeAnswer: TranscribeAnswerUseCase
    getDueCards: GetDueCardsUseCase
    reviewCard: ReviewSrsCardUseCase
    getDashboardSummary: GetDashboardSummaryUseCase
    getLeaderboard: GetLeaderboardUseCase
    getAchievements: GetAchievementsUseCase
  }
}

let instance: Container | null = null

function build(): Container {
  // Un 401 del BFF fuerza la vuelta al login desde cualquier pantalla.
  const http = new BffHttpClient(BFF_BASE_URL, sessionStorageAdapter, () => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.startsWith('/login')) return
    window.location.assign('/login?expired=1')
  })

  const auth = new BffAuthRepository(http, sessionStorageAdapter)
  const content = new BffContentRepository(http)
  const evaluator = new BffAIEvaluatorRepository(http)
  const srs = new BffSrsRepository(http)
  const progress = new BffProgressRepository(http)

  return {
    bffBaseUrl: http.baseUrlValue,
    session: sessionStorageAdapter,
    repositories: { auth, content, evaluator, srs, progress },
    useCases: {
      register: new RegisterUserUseCase(auth),
      login: new LoginUserUseCase(auth),
      logout: new LogoutUserUseCase(auth),
      getCurrentUser: new GetCurrentUserUseCase(auth),
      updateProfile: new UpdateProfileUseCase(auth),
      getVocabulary: new GetVocabularyListUseCase(content),
      getTodayLesson: new GetTodayLessonUseCase(content),
      synthesizeSpeech: new SynthesizeSpeechUseCase(content),
      markWordCompleted: new MarkWordCompletedUseCase(content),
      getInterviewQuestion: new GetInterviewQuestionUseCase(evaluator),
      evaluateAnswer: new EvaluateExamAnswerUseCase(evaluator),
      getWeaknessDrill: new GetWeaknessDrillUseCase(evaluator),
      transcribeAnswer: new TranscribeAnswerUseCase(evaluator),
      getDueCards: new GetDueCardsUseCase(srs),
      reviewCard: new ReviewSrsCardUseCase(srs),
      getDashboardSummary: new GetDashboardSummaryUseCase(progress),
      getLeaderboard: new GetLeaderboardUseCase(progress),
      getAchievements: new GetAchievementsUseCase(progress),
    },
  }
}

/** Singleton perezoso: se instancia una sola vez por sesión de navegador. */
export function getContainer(): Container {
  if (!instance) instance = build()
  return instance
}
