import type { VocabularyWord } from '@/domain/entities/VocabularyWord'
import type {
  IContentRepository,
  Lesson,
  VocabularyQuery,
  SynthesizedSpeech,
} from '@/domain/repositories/IContentRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import { toAudioUrl, toLesson, toVocabularyWord } from '../api/mappers'

type Dto = Record<string, unknown>

/** Contenido pedagógico expuesto por el BFF desde PostgreSQL. */
export class BffContentRepository implements IContentRepository {
  constructor(private readonly http: BffHttpClient) {}

  async getVocabularyList(query: VocabularyQuery = {}): Promise<VocabularyWord[]> {
    const dto = await this.http.get<Dto | Dto[]>('/api/v1/content/vocabulary', {
      query: {
        level: query.level,
        target_role: query.targetRole,
        topic: query.topic,
        limit: query.limit,
      },
    })

    const items = Array.isArray(dto)
      ? dto
      : ((dto.items ?? dto.words ?? dto.data ?? []) as Dto[])

    return items.map(toVocabularyWord)
  }

  async getTodayLesson(): Promise<Lesson> {
    const dto = await this.http.get<Dto>('/api/v1/content/lessons/today')
    return toLesson((dto.lesson ?? dto) as Dto)
  }

  async synthesizeSpeech(
    text: string,
    voice = '',
    rate?: string,
  ): Promise<SynthesizedSpeech> {
    const dto = await this.http.post<Dto>('/api/v1/content/speech', {
      text,
      voice,
      engine: 'neural',
      ...(rate ? { rate } : {}),
    })
    return {
      audioUrl: toAudioUrl(dto),
      provider: dto.provider === 'cloudflare' ? 'cloudflare' : 'aws',
      playbackRate:
        typeof dto.playback_rate === 'number' && Number.isFinite(dto.playback_rate)
          ? dto.playback_rate
          : 1,
    }
  }

  async markWordCompleted(wordId: string): Promise<void> {
    await this.http.post<void>(`/api/v1/content/vocabulary/${wordId}/complete`)
  }
}
