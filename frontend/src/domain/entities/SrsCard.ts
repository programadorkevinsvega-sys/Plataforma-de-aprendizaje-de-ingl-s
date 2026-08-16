/**
 * Repetición espaciada Anki SM-2.
 * La proyección de intervalos vive en el dominio para poder mostrar
 * al alumno el resultado de cada calificación antes de enviarla.
 */

export const SRS_GRADES = [0, 3, 4, 5] as const
export type SrsGrade = (typeof SRS_GRADES)[number]

export interface SrsGradeMeta {
  grade: SrsGrade
  label: string
  hint: string
}

export const SRS_GRADE_META: SrsGradeMeta[] = [
  { grade: 0, label: 'Again', hint: 'Reinicia a 1 día' },
  { grade: 3, label: 'Hard', hint: 'Factor de facilidad ajustado' },
  { grade: 4, label: 'Good', hint: 'Progreso constante' },
  { grade: 5, label: 'Easy', hint: 'Máximo intervalo' },
]

export interface SrsCardProps {
  id: string
  wordId: string
  term: string
  spanishPhonetics: string
  spanishTranslation: string
  exampleEnglish?: string | null
  examplePhonetics?: string | null
  exampleTranslation?: string | null
  audioUrl?: string | null
  repetitions: number
  easeFactor: number
  intervalDays: number
  dueAt: string
  lapses?: number
}

export class SrsCard {
  readonly id: string
  readonly wordId: string
  readonly term: string
  readonly spanishPhonetics: string
  readonly spanishTranslation: string
  readonly exampleEnglish: string | null
  readonly examplePhonetics: string | null
  readonly exampleTranslation: string | null
  readonly audioUrl: string | null
  readonly repetitions: number
  readonly easeFactor: number
  readonly intervalDays: number
  readonly dueAt: string
  readonly lapses: number

  constructor(props: SrsCardProps) {
    this.id = props.id
    this.wordId = props.wordId
    this.term = props.term
    this.spanishPhonetics = props.spanishPhonetics
    this.spanishTranslation = props.spanishTranslation
    this.exampleEnglish = props.exampleEnglish ?? null
    this.examplePhonetics = props.examplePhonetics ?? null
    this.exampleTranslation = props.exampleTranslation ?? null
    this.audioUrl = props.audioUrl ?? null
    this.repetitions = props.repetitions ?? 0
    this.easeFactor = props.easeFactor ?? 2.5
    this.intervalDays = props.intervalDays ?? 0
    this.dueAt = props.dueAt
    this.lapses = props.lapses ?? 0
  }

  get isNew(): boolean {
    return this.repetitions === 0
  }

  /**
   * Proyección local del algoritmo SM-2 — el BFF sigue siendo la fuente
   * de verdad, esto solo alimenta la etiqueta "próximo repaso" en la UI.
   */
  projectInterval(grade: SrsGrade): number {
    if (grade === 0) return 1

    let ease = this.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    ease = Math.max(1.3, Math.round(ease * 100) / 100)

    if (this.repetitions === 0) return 1
    if (this.repetitions === 1) return 6
    return Math.max(1, Math.round(this.intervalDays * ease))
  }
}

export interface SrsReviewOutcome {
  cardId: string
  grade: SrsGrade
  intervalDays: number
  easeFactor: number
  dueAt: string
  techCoinsEarned?: number
}
