import type { VocabularyWord } from '../entities/VocabularyWord'
import type { CefrLevel, TargetRole } from '../entities/User'

export interface VocabularyQuery {
  level?: CefrLevel
  targetRole?: TargetRole
  topic?: string
  limit?: number
}

export interface Lesson {
  id: string
  title: string
  topic: string
  level: CefrLevel
  words: VocabularyWord[]
}

export interface SynthesizedSpeech {
  audioUrl: string
  playbackRate: number
  provider: 'aws' | 'cloudflare'
}

export interface IContentRepository {
  getVocabularyList(query?: VocabularyQuery): Promise<VocabularyWord[]>
  getTodayLesson(): Promise<Lesson>
  /** Synthesizes speech using the provider selected by backend configuration. */
  synthesizeSpeech(text: string, voice?: string, rate?: string): Promise<SynthesizedSpeech>
  markWordCompleted(wordId: string): Promise<void>
}
