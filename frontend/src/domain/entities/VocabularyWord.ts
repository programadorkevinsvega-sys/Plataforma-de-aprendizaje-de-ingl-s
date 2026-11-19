import type { CefrLevel, TargetRole } from './User'

/**
 * El texto y la traducción son el contenido lingüístico principal.
 * Las guías lenta/natural son metadatos editoriales opcionales: el catálogo
 * puede declarar la pronunciación como no requerida para un ítem concreto.
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
  definitionEnglish?: string | null
  lexicalType?: string | null
  tracks?: string[]
  lexicalRegister?: string | null
  editorialPriority?: string | null
  usefulness?: string | null
  contextTags?: string[]
  usageMode?: string | null
  pronunciationStatus?: string | null
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
  readonly definitionEnglish: string | null
  readonly lexicalType: string | null
  readonly tracks: string[]
  readonly lexicalRegister: string | null
  readonly editorialPriority: string | null
  readonly usefulness: string | null
  readonly contextTags: string[]
  readonly usageMode: string | null
  readonly pronunciationStatus: string | null

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
    this.definitionEnglish = props.definitionEnglish ?? null
    this.lexicalType = props.lexicalType ?? null
    this.tracks = props.tracks ?? []
    this.lexicalRegister = props.lexicalRegister ?? null
    this.editorialPriority = props.editorialPriority ?? null
    this.usefulness = props.usefulness ?? null
    this.contextTags = props.contextTags ?? []
    this.usageMode = props.usageMode ?? null
    this.pronunciationStatus = props.pronunciationStatus ?? null
  }

  get hasValidSentenceRange(): boolean {
    return this.sentences.length >= 3 && this.sentences.length <= 5
  }

  get totalSentences(): number {
    return this.sentences.length
  }
}
