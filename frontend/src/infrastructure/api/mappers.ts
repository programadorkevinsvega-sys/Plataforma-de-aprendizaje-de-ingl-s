/**
 * Mappers Anti-Corrupción.
 *
 * El BFF en Rust serializa en `snake_case`; el dominio del frontend habla
 * `camelCase` y trabaja con clases. Toda la traducción ocurre aquí, de forma
 * que un cambio en el contrato HTTP nunca se filtre a las capas superiores.
 */
import {
  DrillStep,
  ExamResult,
  InterviewQuestion,
  METRIC_KEYS,
  type MetricKey,
  type MetricScores,
  WeaknessDrill,
} from '@/domain/entities/ExamResult'
import { DashboardSummary, type MetricPoint } from '@/domain/entities/Progress'
import { SrsCard, type SrsGrade, type SrsReviewOutcome } from '@/domain/entities/SrsCard'
import { User, type AuthSession, type CefrLevel, type TargetRole } from '@/domain/entities/User'
import { VocabularyWord, type ContextSentenceProps } from '@/domain/entities/VocabularyWord'
import type { Lesson } from '@/domain/repositories/IContentRepository'

type Dto = Record<string, unknown>

/** Lee una clave aceptando snake_case y camelCase. */
function pick<T = unknown>(dto: Dto | null | undefined, ...keys: string[]): T | undefined {
  if (!dto) return undefined
  for (const key of keys) {
    const value = dto[key]
    if (value !== undefined && value !== null) return value as T
  }
  return undefined
}

function str(dto: Dto | undefined, keys: string[], fallback = ''): string {
  const value = pick(dto, ...keys)
  return typeof value === 'string' ? value : value != null ? String(value) : fallback
}

function num(dto: Dto | undefined, keys: string[], fallback = 0): number {
  const value = pick(dto, ...keys)
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optStr(dto: Dto | undefined, keys: string[]): string | null {
  const value = pick(dto, ...keys)
  return typeof value === 'string' && value.trim() ? value : null
}

function list(dto: Dto | undefined, keys: string[]): Dto[] {
  const value = pick(dto, ...keys)
  return Array.isArray(value) ? (value as Dto[]) : []
}

function fallbackId(prefix: string, index: number): string {
  return `${prefix}-${index}`
}

/* ─────────────────────────── Auth ─────────────────────────── */

export function toUser(dto: Dto): User {
  const id = str(dto, ['id', 'user_id', 'userId', 'uuid'])
  return new User({
    id,
    email: str(dto, ['email']),
    fullName: str(dto, ['full_name', 'fullName', 'name']),
    targetRole: (str(dto, ['target_role', 'targetRole'], 'BACKEND').toUpperCase() ||
      'BACKEND') as TargetRole,
    currentLevel: (str(dto, ['current_level', 'currentLevel', 'level'], 'A1').toUpperCase() ||
      'A1') as CefrLevel,
    tenantId: optStr(dto, ['tenant_id', 'tenantId']) ?? id,
    streakDays: num(dto, ['streak_days', 'streakDays']),
    techCoins: num(dto, ['tech_coins', 'techCoins']),
    createdAt: optStr(dto, ['created_at', 'createdAt']) ?? undefined,
  })
}

export function toAuthSession(dto: Dto): AuthSession {
  const userDto = (pick<Dto>(dto, 'user', 'profile', 'account') ?? dto) as Dto
  const expiresIn = pick<number>(dto, 'expires_in', 'expiresIn')
  const expiresAtRaw = pick(dto, 'expires_at', 'expiresAt')

  let expiresAt: number | null = null
  if (typeof expiresAtRaw === 'number') {
    expiresAt = expiresAtRaw < 1e12 ? expiresAtRaw * 1000 : expiresAtRaw
  } else if (typeof expiresAtRaw === 'string') {
    const parsed = Date.parse(expiresAtRaw)
    expiresAt = Number.isNaN(parsed) ? null : parsed
  } else if (typeof expiresIn === 'number') {
    expiresAt = Date.now() + expiresIn * 1000
  }

  return {
    accessToken: str(dto, ['access_token', 'accessToken', 'token', 'jwt']),
    refreshToken: optStr(dto, ['refresh_token', 'refreshToken']),
    expiresAt,
    user: toUser(userDto),
  }
}

/* ───────────────────────── Contenido ───────────────────────── */

function toSentences(dto: Dto, wordId: string): ContextSentenceProps[] {
  return list(dto, ['sentences', 'context_sentences', 'contextSentences', 'examples']).map(
    (sentence, index) => ({
      id: str(sentence, ['id', 'sentence_id'], fallbackId(`${wordId}-s`, index)),
      english: str(sentence, ['english', 'english_text', 'text', 'sentence', 'en']),
      spanishPhonetics: str(sentence, [
        'spanish_phonetics',
        'spanish_phonetic',
        'spanishPhonetics',
        'phonetics',
        'pronunciation',
      ]),
      spanishPhoneticsNatural: str(sentence, [
        'spanish_phonetic_natural',
        'spanishPhoneticNatural',
        'spanishPhoneticsNatural',
        'natural_phonetic',
      ]),
      spanishTranslation: str(sentence, [
        'spanish_translation',
        'spanishTranslation',
        'translation',
        'es',
      ]),
      audioUrl: optStr(sentence, ['audio_url', 'audioUrl']),
    }),
  )
}

export function toVocabularyWord(dto: Dto, index = 0): VocabularyWord {
  const id = str(dto, ['id', 'word_id', 'wordId'], fallbackId('word', index))
  const role = optStr(dto, ['target_role', 'targetRole'])

  return new VocabularyWord({
    id,
    term: str(dto, ['term', 'word', 'english']),
    spanishPhonetics: str(dto, ['spanish_phonetics', 'spanish_phonetic', 'spanishPhonetics', 'phonetics']),
    spanishPhoneticsNatural: str(dto, [
      'spanish_phonetic_natural',
      'spanishPhoneticNatural',
      'spanishPhoneticsNatural',
    ]),
    spanishTranslation: str(dto, ['spanish_translation', 'spanishTranslation', 'translation']),
    partOfSpeech: optStr(dto, ['part_of_speech', 'partOfSpeech', 'pos']),
    level: (str(dto, ['level', 'cefr_level', 'cefrLevel'], 'A1').toUpperCase() ||
      'A1') as CefrLevel,
    targetRole: role ? (role.toUpperCase() as TargetRole) : null,
    topic: optStr(dto, ['topic', 'category']),
    audioUrl: optStr(dto, ['audio_url', 'audioUrl']),
    sentences: toSentences(dto, id),
  })
}

export function toLesson(dto: Dto): Lesson {
  return {
    id: str(dto, ['id', 'lesson_id', 'lessonId'], 'today'),
    title: str(dto, ['title', 'name'], 'Lección de hoy'),
    topic: str(dto, ['topic', 'category'], 'General'),
    level: (str(dto, ['level', 'cefr_level'], 'A1').toUpperCase() || 'A1') as CefrLevel,
    words: list(dto, ['words', 'vocabulary', 'items']).map(toVocabularyWord),
  }
}

export function toAudioUrl(dto: Dto): string {
  const direct = optStr(dto, ['audio_url', 'audioUrl', 'url'])
  if (direct) return direct

  const base64 = optStr(dto, ['audio_base64', 'audioBase64', 'audio', 'data'])
  if (base64) {
    const mime = optStr(dto, ['content_type', 'contentType', 'mime_type']) ?? 'audio/mpeg'
    return base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`
  }

  return ''
}

/* ─────────────────────────── SRS ─────────────────────────── */

export function toSrsCard(dto: Dto, index = 0): SrsCard {
  const word = (pick<Dto>(dto, 'word', 'vocabulary_word', 'vocabularyWord') ?? {}) as Dto
  const firstSentence = (list(dto, ['sentences']).at(0) ??
    list(word, ['sentences', 'context_sentences']).at(0) ??
    {}) as Dto

  return new SrsCard({
    id: str(dto, ['id', 'card_id', 'cardId'], fallbackId('card', index)),
    wordId: str(dto, ['word_id', 'wordId'], str(word, ['id'], '')),
    term: str(dto, ['term', 'word'], str(word, ['term', 'word'])),
    spanishPhonetics: str(
      dto,
      ['spanish_phonetics', 'spanishPhonetics'],
      str(word, ['spanish_phonetics', 'spanishPhonetics']),
    ),
    spanishTranslation: str(
      dto,
      ['spanish_translation', 'spanishTranslation'],
      str(word, ['spanish_translation', 'spanishTranslation']),
    ),
    exampleEnglish: optStr(firstSentence, ['english', 'text']),
    examplePhonetics: optStr(firstSentence, ['spanish_phonetics', 'spanishPhonetics']),
    exampleTranslation: optStr(firstSentence, ['spanish_translation', 'spanishTranslation']),
    audioUrl: optStr(dto, ['audio_url', 'audioUrl']) ?? optStr(word, ['audio_url', 'audioUrl']),
    repetitions: num(dto, ['repetitions', 'reps'], 0),
    easeFactor: num(dto, ['ease_factor', 'easeFactor'], 2.5),
    intervalDays: num(dto, ['interval_days', 'intervalDays', 'interval'], 0),
    dueAt: str(dto, ['due_at', 'dueAt', 'next_review_at'], new Date().toISOString()),
    lapses: num(dto, ['lapses'], 0),
  })
}

export function toSrsReviewOutcome(dto: Dto, cardId: string, grade: SrsGrade): SrsReviewOutcome {
  return {
    cardId: str(dto, ['card_id', 'cardId'], cardId),
    grade,
    intervalDays: num(dto, ['interval_days', 'intervalDays', 'interval'], 1),
    easeFactor: num(dto, ['ease_factor', 'easeFactor'], 2.5),
    dueAt: str(dto, ['due_at', 'dueAt', 'next_review_at'], new Date().toISOString()),
    techCoinsEarned: num(dto, ['tech_coins_earned', 'techCoinsEarned'], 0),
  }
}

/* ──────────────────── Evaluación / Métricas ──────────────────── */

const METRIC_ALIASES: Record<MetricKey, string[]> = {
  listening: ['listening', 'listening_score', 'comprehension'],
  pronunciation: ['pronunciation', 'pronunciation_score', 'accent'],
  fluency: ['fluency', 'fluency_score', 'flow'],
  vocabulary: ['vocabulary', 'vocabulary_score', 'lexis'],
  conversation: ['conversation', 'conversation_score', 'interaction'],
  grammar: ['grammar', 'grammar_score', 'accuracy'],
}

export function toMetricScores(dto: Dto | undefined): MetricScores {
  const source = (pick<Dto>(dto, 'scores', 'metrics', 'metric_scores') ?? dto ?? {}) as Dto
  const scores = {} as MetricScores

  for (const key of METRIC_KEYS) {
    scores[key] = Math.max(0, Math.min(100, num(source, METRIC_ALIASES[key], 0)))
  }

  return scores
}

function toWeakestMetrics(dto: Dto | undefined, scores: MetricScores): MetricKey[] {
  const raw = list(dto, ['weakest_metrics', 'weakestMetrics']) as unknown as string[]
  const valid = (Array.isArray(raw) ? raw : [])
    .map((metric) => String(metric).toLowerCase())
    .filter((metric): metric is MetricKey => METRIC_KEYS.includes(metric as MetricKey))

  if (valid.length >= 2) return valid.slice(0, 2)

  return [...METRIC_KEYS].sort((a, b) => scores[a] - scores[b]).slice(0, 2)
}

export function toWeaknessDrill(dto: Dto, scores: MetricScores): WeaknessDrill {
  const weakest = toWeakestMetrics(dto, scores)
  const steps = list(dto, ['steps', 'exercises', 'items']).map((step, index) => {
    const metric = String(
      pick(step, 'metric', 'metric_key', 'area') ?? weakest[index % weakest.length],
    ).toLowerCase()

    return new DrillStep({
      id: str(step, ['id'], fallbackId('step', index)),
      metric: (METRIC_KEYS.includes(metric as MetricKey)
        ? metric
        : weakest[index % weakest.length]) as MetricKey,
      title: str(step, ['title', 'name'], `Ejercicio ${index + 1}`),
      instruction: str(step, ['instruction', 'description', 'prompt']),
      english: optStr(step, ['english', 'text']),
      spanishPhonetics: optStr(step, ['spanish_phonetics', 'spanishPhonetics']),
      spanishTranslation: optStr(step, ['spanish_translation', 'spanishTranslation']),
      durationMinutes: num(step, ['duration_minutes', 'durationMinutes'], 5),
    }).toProps()
  })

  return new WeaknessDrill({
    id: str(dto, ['id', 'drill_id', 'drillId'], 'drill'),
    weakestMetrics: weakest,
    totalMinutes: num(dto, ['total_minutes', 'totalMinutes'], 20),
    steps,
  })
}

export function toExamResult(dto: Dto, request: { questionId: string; question: string; answer: string }): ExamResult {
  const scores = toMetricScores(dto)
  const drillDto = pick<Dto>(dto, 'drill', 'weakness_drill', 'weaknessDrill')
  const overall = pick<number>(dto, 'overall_score', 'overallScore', 'total_score')

  return new ExamResult({
    id: str(dto, ['id', 'result_id', 'resultId'], `result-${Date.now()}`),
    questionId: str(dto, ['question_id', 'questionId'], request.questionId),
    question: str(dto, ['question', 'prompt'], request.question),
    answer: str(dto, ['answer', 'transcript'], request.answer),
    scores,
    overallScore: typeof overall === 'number' ? overall : undefined,
    recruiterFeedback: optStr(dto, ['recruiter_feedback', 'recruiterFeedback', 'feedback']),
    correctedAnswer: optStr(dto, ['corrected_answer', 'correctedAnswer', 'correction']),
    drill: drillDto ? toWeaknessDrill(drillDto, scores).toProps() : null,
    evaluatedAt: optStr(dto, ['evaluated_at', 'evaluatedAt', 'created_at']),
  })
}

export function toInterviewQuestion(dto: Dto): InterviewQuestion {
  return new InterviewQuestion({
    id: str(dto, ['id', 'question_id', 'questionId'], `question-${Date.now()}`),
    prompt: str(dto, ['prompt', 'question', 'text']),
    spanishHint: optStr(dto, ['spanish_hint', 'spanishHint', 'hint']),
    category: optStr(dto, ['category', 'topic']),
    difficulty: optStr(dto, ['difficulty', 'level']),
    audioUrl: optStr(dto, ['audio_url', 'audioUrl']),
  })
}

/* ───────────────────────── Progreso ───────────────────────── */

export function toDashboardSummary(dto: Dto): DashboardSummary {
  const lessonDto = pick<Dto>(dto, 'today_lesson', 'todayLesson')

  const history: MetricPoint[] = list(dto, ['history', 'metric_history', 'metricHistory']).map(
    (point) => ({
      date: str(point, ['date', 'day', 'recorded_at'], ''),
      scores: toMetricScores(point),
    }),
  )

  return new DashboardSummary({
    streakDays: num(dto, ['streak_days', 'streakDays']),
    techCoins: num(dto, ['tech_coins', 'techCoins', 'coins']),
    xp: num(dto, ['xp']),
    currentLevel: (str(dto, ['current_level', 'currentLevel'], 'A1').toUpperCase() ||
      'A1') as CefrLevel,
    levelProgressPercent: num(dto, ['level_progress_percent', 'levelProgressPercent']),
    wordsMastered: num(dto, ['words_mastered', 'wordsMastered', 'words_learned', 'wordsLearned']),
    dueReviews: num(dto, ['due_reviews', 'dueReviews', 'cards_due']),
    lessonsCompleted: num(dto, ['lessons_completed', 'lessonsCompleted']),
    interviewsTaken: num(dto, ['interviews_taken', 'interviewsTaken']),
    bestOverallScore: num(dto, ['best_overall_score', 'bestOverallScore']),
    currentMetrics: toMetricScores(
      (pick<Dto>(dto, 'current_metrics', 'currentMetrics') ?? {}) as Dto,
    ),
    history,
    todayLesson: lessonDto
      ? {
          id: str(lessonDto, ['id'], 'today'),
          title: str(lessonDto, ['title', 'name'], 'Lección de hoy'),
          topic: str(lessonDto, ['topic'], 'General'),
          wordCount: num(lessonDto, ['word_count', 'wordCount'], 0),
        }
      : null,
  })
}

export function toLeaderboardEntry(dto: Dto): import('@/domain/entities/Progress').LeaderboardEntry {
  return {
    rank: num(dto, ['rank']),
    userId: str(dto, ['user_id', 'userId']),
    fullName: str(dto, ['full_name', 'fullName']),
    currentLevel: (str(dto, ['current_level', 'currentLevel'], 'A1').toUpperCase() || 'A1') as CefrLevel,
    xp: num(dto, ['xp']),
    streakDays: num(dto, ['streak_days', 'streakDays']),
  }
}

export function toAchievement(dto: Dto): import('@/domain/entities/Progress').Achievement {
  return {
    id: str(dto, ['id']),
    emoji: str(dto, ['emoji']),
    title: str(dto, ['title']),
    description: str(dto, ['description']),
    unlocked: Boolean(pick(dto, 'unlocked')),
    progress: num(dto, ['progress']),
    maxProgress: num(dto, ['max_progress', 'maxProgress']),
    category: str(dto, ['category']),
  }
}
