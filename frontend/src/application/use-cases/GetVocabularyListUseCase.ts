import type { VocabularyWord } from '@/domain/entities/VocabularyWord'
import type {
  IContentRepository,
  VocabularyQuery,
  SynthesizedSpeech,
  VocabularyPage,
  ComprehensionQuery,
  ComprehensionPage,
} from '@/domain/repositories/IContentRepository'

export class GetVocabularyListUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  async execute(query: VocabularyQuery = {}): Promise<VocabularyWord[]> {
    const words = await this.contentRepository.getVocabularyList(query)
    // Descartamos ejemplos sin texto inglés o traducción; la guía fonética puede ser no requerida.
    return words.filter((word) =>
      word.sentences.every((sentence) => sentence.isPedagogicallyValid),
    )
  }
}

export class GetVocabularyPageUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  async execute(query: VocabularyQuery = {}): Promise<VocabularyPage> {
    const page = await this.contentRepository.getVocabularyPage(query)
    return {
      ...page,
      items: page.items.filter((word) =>
        word.sentences.every((sentence) => sentence.isPedagogicallyValid),
      ),
    }
  }
}

export class GetComprehensionResourcesUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  execute(query: ComprehensionQuery): Promise<ComprehensionPage> {
    return this.contentRepository.getComprehensionResources(query)
  }
}

export class SynthesizeSpeechUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  /** Uses the provider-neutral speech contract; playback speed is provider-aware. */
  execute(text: string, voice?: string, rate?: string): Promise<SynthesizedSpeech> {
    return this.contentRepository.synthesizeSpeech(text, voice, rate)
  }
}
