import type { CefrLevel, TargetRole } from './User'

/**
 * Regla de Oro Pedagógica:
 * Cada oración lleva fonética lenta (palabra por palabra) y fonética natural (habla conectada / connected speech).
 */
export interface ContextSentenceProps {
  id: string
  english: string
  /** Fonética lenta palabra por palabra (ej. "jí iz a bói") */
  spanishPhonetics: string
  /** Fonética natural en habla conectada (ej. "jis a bói") */
  spanishPhoneticsNatural?: string
  spanishTranslation: string
  audioUrl?: string | null
}

export class ContextSentence {
  readonly id: string
  readonly english: string
  readonly spanishPhonetics: string
  readonly spanishPhoneticsNatural: string
  readonly spanishTranslation: string
  readonly audioUrl: string | null

  constructor(props: ContextSentenceProps) {
    this.id = props.id
    this.english = props.english
    this.spanishPhonetics = props.spanishPhonetics
    this.spanishPhoneticsNatural = props.spanishPhoneticsNatural || props.spanishPhonetics
    this.spanishTranslation = props.spanishTranslation
    this.audioUrl = props.audioUrl ?? null
  }

  get isPedagogicallyValid(): boolean {
    return Boolean(
      this.english?.trim() &&
        this.spanishPhonetics?.trim() &&
        this.spanishTranslation?.trim(),
    )
  }

  get usesIpa(): boolean {
    return /[ɪəʊʌæŋʃʒθðɜɒː]/.test(this.spanishPhonetics)
  }
}

export interface VocabularyWordProps {
  id: string
  term: string
  spanishPhonetics: string
  spanishPhoneticsNatural?: string
  spanishTranslation: string
  partOfSpeech?: string | null
  level: CefrLevel
  targetRole?: TargetRole | null
  topic?: string | null
  audioUrl?: string | null
  sentences: ContextSentenceProps[]
}

export class VocabularyWord {
  readonly id: string
  readonly term: string
  readonly spanishPhonetics: string
  readonly spanishPhoneticsNatural: string
  readonly spanishTranslation: string
  readonly partOfSpeech: string | null
  readonly level: CefrLevel
  readonly targetRole: TargetRole | null
  readonly topic: string | null
  readonly audioUrl: string | null
  readonly sentences: ContextSentence[]

  constructor(props: VocabularyWordProps) {
    this.id = props.id
    this.term = props.term
    this.spanishPhonetics = props.spanishPhonetics
    this.spanishPhoneticsNatural = props.spanishPhoneticsNatural || props.spanishPhonetics
    this.spanishTranslation = props.spanishTranslation
    this.partOfSpeech = props.partOfSpeech ?? null
    this.level = props.level
    this.targetRole = props.targetRole ?? null
    this.topic = props.topic ?? null
    this.audioUrl = props.audioUrl ?? null
    this.sentences = (props.sentences ?? []).map((s) => new ContextSentence(s))
  }

  get hasValidSentenceRange(): boolean {
    return this.sentences.length >= 3 && this.sentences.length <= 5
  }

  get totalSentences(): number {
    return this.sentences.length
  }
}
