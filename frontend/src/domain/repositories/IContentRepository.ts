import type { VocabularyWord } from '../entities/VocabularyWord'
import type { CefrLevel, TargetRole } from '../entities/User'

export interface VocabularyQuery {
  level?: CefrLevel | 'all'
  targetRole?: TargetRole
  topic?: string
  category?: string
  track?: 'general' | 'technology'
  page?: number
  pageSize?: number
  limit?: number
}

export interface VocabularyPage {
  items: VocabularyWord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ComprehensionSkill = 'reading' | 'listening'

export interface ComprehensionQuery {
  page: number
  pageSize: number
  track?: 'general' | 'technology'
  cefrLevel?: CefrLevel
  skill?: ComprehensionSkill
}

export interface ComprehensionQuestion {
  id: string
  prompt: string
}

export interface ComprehensionResource {
  id: string
  track: 'general' | 'technology'
  cefrLevel: CefrLevel
  skill: ComprehensionSkill
  title: string
  topic: string
  content: string
  wordCount: number
  sentenceCount: number
  estimatedMinutes: number
  comprehensionFocus: string
  lexicalTags: string[]
  transcriptAvailable: boolean
  audioUrl: string | null
  audioStatus: string
  questions: ComprehensionQuestion[]
}

export interface ComprehensionPage {
  items: ComprehensionResource[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SynthesizedSpeech {
  audioUrl: string
  playbackRate: number
  provider: 'aws' | 'cloudflare'
}

export interface IContentRepository {
  getVocabularyList(query?: VocabularyQuery): Promise<VocabularyWord[]>
  getVocabularyPage(query?: VocabularyQuery): Promise<VocabularyPage>
  getComprehensionResources(query: ComprehensionQuery): Promise<ComprehensionPage>
  /** Synthesizes speech using the provider selected by backend configuration. */
  synthesizeSpeech(text: string, voice?: string, rate?: string): Promise<SynthesizedSpeech>
}
