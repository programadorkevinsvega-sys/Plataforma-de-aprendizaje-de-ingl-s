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
import {
  GetLearningSessionUseCase,
  RevealLearningHintUseCase,
  StartLessonSessionUseCase,
  SubmitLearningActivityUseCase,
} from '@/application/use-cases/LearningSessionUseCases'
import {
  EnrollInCurriculumCourseUseCase,
  GetCurriculumCourseUseCase,
  GetCurriculumCoursesUseCase,
  GetCurriculumEditorialVersionsUseCase,
  ImportCurriculumContentPackageUseCase,
  ManageCurriculumEditorialVersionUseCase,
  SaveCurriculumDraftUseCase,
} from '@/application/use-cases/CurriculumUseCases'
import { GetDashboardSummaryUseCase } from '@/application/use-cases/GetDashboardSummaryUseCase'
import { GetLeaderboardUseCase } from '@/application/use-cases/GetLeaderboardUseCase'
import { RecordLearningProgressUseCase } from '@/application/use-cases/RecordLearningProgressUseCase'
import {
  GetVocabularyListUseCase,
  GetVocabularyPageUseCase,
  GetComprehensionResourcesUseCase,
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
import type { ICurriculumRepository } from '@/domain/repositories/ICurriculumRepository'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'
import type { ILearningSessionRepository } from '@/domain/repositories/ILearningSessionRepository'
import type { ISrsRepository } from '@/domain/repositories/ISrsRepository'
import { BFF_BASE_URL, BffHttpClient } from '../api/BffHttpClient'
import { BffAIEvaluatorRepository } from '../repositories/BffAIEvaluatorRepository'
import { BffAuthRepository } from '../repositories/BffAuthRepository'
import { BffContentRepository } from '../repositories/BffContentRepository'
import { BffCurriculumRepository } from '../repositories/BffCurriculumRepository'
import { BffProgressRepository } from '../repositories/BffProgressRepository'
import { BffLearningSessionRepository } from '../repositories/BffLearningSessionRepository'
import { BffSrsRepository } from '../repositories/BffSrsRepository'
import { sessionStorageAdapter } from '../storage/SessionStorage'

export interface Container {
  bffBaseUrl: string
  session: typeof sessionStorageAdapter
  repositories: {
    auth: IAuthRepository
    content: IContentRepository
    curriculum: ICurriculumRepository
    evaluator: IAIEvaluatorRepository
    srs: ISrsRepository
    progress: IProgressRepository
    learningSessions: ILearningSessionRepository
  }
  useCases: {
    register: RegisterUserUseCase
    login: LoginUserUseCase
    logout: LogoutUserUseCase
    getCurrentUser: GetCurrentUserUseCase
    updateProfile: UpdateProfileUseCase
    getVocabulary: GetVocabularyListUseCase
    getVocabularyPage: GetVocabularyPageUseCase
    getComprehensionResources: GetComprehensionResourcesUseCase
    getCurriculumCourses: GetCurriculumCoursesUseCase
    getCurriculumCourse: GetCurriculumCourseUseCase
    enrollInCurriculumCourse: EnrollInCurriculumCourseUseCase
    getCurriculumEditorialVersions: GetCurriculumEditorialVersionsUseCase
    manageCurriculumEditorialVersion: ManageCurriculumEditorialVersionUseCase
    importCurriculumContentPackage: ImportCurriculumContentPackageUseCase
    saveCurriculumDraft: SaveCurriculumDraftUseCase
    synthesizeSpeech: SynthesizeSpeechUseCase
    getInterviewQuestion: GetInterviewQuestionUseCase
    evaluateAnswer: EvaluateExamAnswerUseCase
    getWeaknessDrill: GetWeaknessDrillUseCase
    transcribeAnswer: TranscribeAnswerUseCase
    getDueCards: GetDueCardsUseCase
    reviewCard: ReviewSrsCardUseCase
    getDashboardSummary: GetDashboardSummaryUseCase
    getLeaderboard: GetLeaderboardUseCase
    getAchievements: GetAchievementsUseCase
    recordLearningProgress: RecordLearningProgressUseCase
    startLessonSession: StartLessonSessionUseCase
    getLearningSession: GetLearningSessionUseCase
    revealLearningHint: RevealLearningHintUseCase
    submitLearningActivity: SubmitLearningActivityUseCase
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
  const curriculum = new BffCurriculumRepository(http)
  const evaluator = new BffAIEvaluatorRepository(http)
  const srs = new BffSrsRepository(http)
  const progress = new BffProgressRepository(http)
  const learningSessions = new BffLearningSessionRepository(http)

  return {
    bffBaseUrl: http.baseUrlValue,
    session: sessionStorageAdapter,
    repositories: { auth, content, curriculum, evaluator, srs, progress, learningSessions },
    useCases: {
      register: new RegisterUserUseCase(auth),
      login: new LoginUserUseCase(auth),
      logout: new LogoutUserUseCase(auth),
      getCurrentUser: new GetCurrentUserUseCase(auth),
      updateProfile: new UpdateProfileUseCase(auth),
      getVocabulary: new GetVocabularyListUseCase(content),
      getVocabularyPage: new GetVocabularyPageUseCase(content),
      getComprehensionResources: new GetComprehensionResourcesUseCase(content),
      getCurriculumCourses: new GetCurriculumCoursesUseCase(curriculum),
      getCurriculumCourse: new GetCurriculumCourseUseCase(curriculum),
      enrollInCurriculumCourse: new EnrollInCurriculumCourseUseCase(curriculum),
      getCurriculumEditorialVersions: new GetCurriculumEditorialVersionsUseCase(curriculum),
      manageCurriculumEditorialVersion: new ManageCurriculumEditorialVersionUseCase(curriculum),
      importCurriculumContentPackage: new ImportCurriculumContentPackageUseCase(curriculum),
      saveCurriculumDraft: new SaveCurriculumDraftUseCase(curriculum),
      synthesizeSpeech: new SynthesizeSpeechUseCase(content),
      getInterviewQuestion: new GetInterviewQuestionUseCase(evaluator),
      evaluateAnswer: new EvaluateExamAnswerUseCase(evaluator),
      getWeaknessDrill: new GetWeaknessDrillUseCase(evaluator),
      transcribeAnswer: new TranscribeAnswerUseCase(evaluator),
      getDueCards: new GetDueCardsUseCase(srs),
      reviewCard: new ReviewSrsCardUseCase(srs),
      getDashboardSummary: new GetDashboardSummaryUseCase(progress),
      getLeaderboard: new GetLeaderboardUseCase(progress),
      getAchievements: new GetAchievementsUseCase(progress),
      recordLearningProgress: new RecordLearningProgressUseCase(progress),
      startLessonSession: new StartLessonSessionUseCase(learningSessions),
      getLearningSession: new GetLearningSessionUseCase(learningSessions),
      revealLearningHint: new RevealLearningHintUseCase(learningSessions),
      submitLearningActivity: new SubmitLearningActivityUseCase(learningSessions),
    },
  }
}

/** Singleton perezoso: se instancia una sola vez por sesión de navegador. */
export function getContainer(): Container {
  if (!instance) instance = build()
  return instance
}
