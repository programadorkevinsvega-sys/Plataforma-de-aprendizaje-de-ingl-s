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

export interface IContentRepository {
  getVocabularyList(query?: VocabularyQuery): Promise<VocabularyWord[]>
  getTodayLesson(): Promise<Lesson>
  /** Devuelve la URL de audio neural (AWS Polly) para un texto dado.
   * @param voice  'Matthew' o 'Joanna' para inglés, 'Lupe' para fonética en español.
   * @param rate   Velocidad SSML: 'x-slow' | 'slow' | 'medium' | 'fast'. Omitir = normal.
   */
  synthesizeSpeech(text: string, voice?: string, rate?: string): Promise<string>
  markWordCompleted(wordId: string): Promise<void>
}
