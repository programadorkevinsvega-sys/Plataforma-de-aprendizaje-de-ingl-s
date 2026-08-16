/**
 * Matriz de 6 Métricas. Los pesos suman 100 y viven en el dominio,
 * nunca en la UI ni en la capa HTTP.
 */
export const METRIC_KEYS = [
  'listening',
  'pronunciation',
  'fluency',
  'vocabulary',
  'conversation',
  'grammar',
] as const

export type MetricKey = (typeof METRIC_KEYS)[number]

export const METRIC_WEIGHTS: Record<MetricKey, number> = {
  listening: 20,
  pronunciation: 20,
  fluency: 20,
  vocabulary: 15,
  conversation: 15,
  grammar: 10,
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  listening: 'Listening',
  pronunciation: 'Pronunciación',
  fluency: 'Fluidez',
  vocabulary: 'Vocabulario',
  conversation: 'Conversación',
  grammar: 'Gramática',
}

/** Umbral de aprobación del sistema. */
export const PASSING_THRESHOLD = 90.0

/** Duración del dril quirúrgico generado ante un desaprobado. */
export const WEAKNESS_DRILL_MINUTES = 20

export type MetricScores = Record<MetricKey, number>

export interface DrillStepProps {
  id: string
  metric: MetricKey
  title: string
  instruction: string
  english?: string | null
  spanishPhonetics?: string | null
  spanishTranslation?: string | null
  durationMinutes: number
}

export class DrillStep {
  readonly id: string
  readonly metric: MetricKey
  readonly title: string
  readonly instruction: string
  readonly english: string | null
  readonly spanishPhonetics: string | null
  readonly spanishTranslation: string | null
  readonly durationMinutes: number

  constructor(props: DrillStepProps) {
    this.id = props.id
    this.metric = props.metric
    this.title = props.title
    this.instruction = props.instruction
    this.english = props.english ?? null
    this.spanishPhonetics = props.spanishPhonetics ?? null
    this.spanishTranslation = props.spanishTranslation ?? null
    this.durationMinutes = props.durationMinutes
  }

  toProps(): DrillStepProps {
    return {
      id: this.id,
      metric: this.metric,
      title: this.title,
      instruction: this.instruction,
      english: this.english,
      spanishPhonetics: this.spanishPhonetics,
      spanishTranslation: this.spanishTranslation,
      durationMinutes: this.durationMinutes,
    }
  }
}

export interface WeaknessDrillProps {
  id: string
  /** Las 2 métricas más débiles aisladas automáticamente. */
  weakestMetrics: MetricKey[]
  totalMinutes?: number
  steps: DrillStepProps[]
}

export class WeaknessDrill {
  readonly id: string
  readonly weakestMetrics: MetricKey[]
  readonly totalMinutes: number
  readonly steps: DrillStep[]

  constructor(props: WeaknessDrillProps) {
    this.id = props.id
    this.weakestMetrics = props.weakestMetrics
    this.totalMinutes = props.totalMinutes ?? WEAKNESS_DRILL_MINUTES
    this.steps = (props.steps ?? []).map((s) => new DrillStep(s))
  }

  toProps(): WeaknessDrillProps {
    return {
      id: this.id,
      weakestMetrics: this.weakestMetrics,
      totalMinutes: this.totalMinutes,
      steps: this.steps.map((step) => step.toProps()),
    }
  }
}

export interface ExamResultProps {
  id: string
  questionId: string
  question: string
  answer: string
  scores: MetricScores
  overallScore?: number
  recruiterFeedback?: string | null
  correctedAnswer?: string | null
  drill?: WeaknessDrillProps | null
  evaluatedAt?: string | null
}

export class ExamResult {
  readonly id: string
  readonly questionId: string
  readonly question: string
  readonly answer: string
  readonly scores: MetricScores
  readonly overallScore: number
  readonly recruiterFeedback: string | null
  readonly correctedAnswer: string | null
  readonly drill: WeaknessDrill | null
  readonly evaluatedAt: string | null

  constructor(props: ExamResultProps) {
    this.id = props.id
    this.questionId = props.questionId
    this.question = props.question
    this.answer = props.answer
    this.scores = props.scores
    this.overallScore = props.overallScore ?? ExamResult.weightedScore(props.scores)
    this.recruiterFeedback = props.recruiterFeedback ?? null
    this.correctedAnswer = props.correctedAnswer ?? null
    this.drill = props.drill ? new WeaknessDrill(props.drill) : null
    this.evaluatedAt = props.evaluatedAt ?? null
  }

  /** Promedio ponderado según METRIC_WEIGHTS. */
  static weightedScore(scores: MetricScores): number {
    const total = METRIC_KEYS.reduce(
      (acc, key) => acc + (scores[key] ?? 0) * METRIC_WEIGHTS[key],
      0,
    )
    return Math.round((total / 100) * 10) / 10
  }

  get passed(): boolean {
    return this.overallScore >= PASSING_THRESHOLD
  }

  get verdict(): 'APROBADO' | 'DESAPROBADO' {
    return this.passed ? 'APROBADO' : 'DESAPROBADO'
  }

  get pointsToPass(): number {
    return Math.max(0, Math.round((PASSING_THRESHOLD - this.overallScore) * 10) / 10)
  }

  /** Aísla las 2 áreas más débiles para el dril quirúrgico. */
  get weakestMetrics(): MetricKey[] {
    return [...METRIC_KEYS]
      .sort((a, b) => (this.scores[a] ?? 0) - (this.scores[b] ?? 0))
      .slice(0, 2)
  }

  get requiresDrill(): boolean {
    return !this.passed
  }
}

export interface InterviewQuestionProps {
  id: string
  prompt: string
  spanishHint?: string | null
  category?: string | null
  difficulty?: string | null
  audioUrl?: string | null
}

export class InterviewQuestion {
  readonly id: string
  readonly prompt: string
  readonly spanishHint: string | null
  readonly category: string | null
  readonly difficulty: string | null
  readonly audioUrl: string | null

  constructor(props: InterviewQuestionProps) {
    this.id = props.id
    this.prompt = props.prompt
    this.spanishHint = props.spanishHint ?? null
    this.category = props.category ?? null
    this.difficulty = props.difficulty ?? null
    this.audioUrl = props.audioUrl ?? null
  }
}
