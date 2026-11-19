import type { VocabularyWord } from '@/domain/entities/VocabularyWord'
import type {
  IContentRepository,
  VocabularyQuery,
  SynthesizedSpeech,
} from '@/domain/repositories/IContentRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import { toAudioUrl, toComprehensionResource, toVocabularyWord } from '../api/mappers'

type Dto = Record<string, unknown>

/** Contenido pedagógico expuesto por el BFF desde PostgreSQL. */
export class BffContentRepository implements IContentRepository {
  constructor(private readonly http: BffHttpClient) {}

  async getVocabularyList(query: VocabularyQuery = {}): Promise<VocabularyWord[]> {
    const page = await this.getVocabularyPage({
      ...query,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? query.limit ?? 50,
    })
    return page.items
  }

  async getVocabularyPage(query: VocabularyQuery = {}): Promise<import('@/domain/repositories/IContentRepository').VocabularyPage> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? query.limit ?? 20
    const dto = await this.http.get<Dto>('/api/v1/content/vocabulary', {
      query: {
        level: query.level,
        category: query.category,
        track: query.track,
        page,
        page_size: pageSize,
      },
    })
    const items = Array.isArray(dto.items) ? (dto.items as Dto[]) : []
    return {
      items: items.map(toVocabularyWord),
      total: Number(dto.total ?? 0),
      page: Number(dto.page ?? page),
      pageSize: Number(dto.page_size ?? pageSize),
      totalPages: Number(dto.total_pages ?? 0),
    }
  }

  async getComprehensionResources(query: import('@/domain/repositories/IContentRepository').ComprehensionQuery): Promise<import('@/domain/repositories/IContentRepository').ComprehensionPage> {
    const dto = await this.http.get<Dto>('/api/v1/content/comprehension-resources', {
      query: {
        page: query.page,
        page_size: query.pageSize,
        track: query.track,
        cefr_level: query.cefrLevel,
        skill: query.skill,
      },
    })
    const items = Array.isArray(dto.items) ? (dto.items as Dto[]) : []
    return {
      items: items.map(toComprehensionResource),
      total: Number(dto.total ?? 0),
      page: Number(dto.page ?? query.page),
      pageSize: Number(dto.page_size ?? query.pageSize),
      totalPages: Number(dto.total_pages ?? 0),
    }
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
}
