import type { VocabularyWord } from '@/domain/entities/VocabularyWord'
import type {
  IContentRepository,
  Lesson,
  VocabularyQuery,
  SynthesizedSpeech,
} from '@/domain/repositories/IContentRepository'

export class GetVocabularyListUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  async execute(query: VocabularyQuery = {}): Promise<VocabularyWord[]> {
    const words = await this.contentRepository.getVocabularyList(query)
    // Regla de Oro: descartamos tarjetas que no cumplan el formato de 3 líneas.
    return words.filter((word) =>
      word.sentences.every((sentence) => sentence.isPedagogicallyValid),
    )
  }
}

export class GetTodayLessonUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  execute(): Promise<Lesson> {
    return this.contentRepository.getTodayLesson()
  }
}

export class SynthesizeSpeechUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  /** Uses the provider-neutral speech contract; playback speed is provider-aware. */
  execute(text: string, voice?: string, rate?: string): Promise<SynthesizedSpeech> {
    return this.contentRepository.synthesizeSpeech(text, voice, rate)
  }
}

export class MarkWordCompletedUseCase {
  constructor(private readonly contentRepository: IContentRepository) {}

  execute(wordId: string): Promise<void> {
    return this.contentRepository.markWordCompleted(wordId)
  }
}
