import type { SrsCard, SrsGrade, SrsReviewOutcome } from '@/domain/entities/SrsCard'
import type { ISrsRepository } from '@/domain/repositories/ISrsRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import { toSrsCard, toSrsReviewOutcome } from '../api/mappers'

type Dto = Record<string, unknown>

/** Repetición espaciada SM-2. El BFF y PostgreSQL son la fuente de verdad. */
export class BffSrsRepository implements ISrsRepository {
  constructor(private readonly http: BffHttpClient) {}

  async getDueCards(limit = 20): Promise<SrsCard[]> {
    const dto = await this.http.get<Dto | Dto[]>('/api/v1/srs/due', {
      query: { limit },
    })

    const items = Array.isArray(dto)
      ? dto
      : ((dto.items ?? dto.cards ?? dto.data ?? []) as Dto[])

    return items.map(toSrsCard)
  }

  async reviewCard(cardId: string, grade: SrsGrade): Promise<SrsReviewOutcome> {
    const dto = await this.http.post<Dto>(`/api/v1/srs/cards/${cardId}/review`, {
      grade,
    })
    return toSrsReviewOutcome((dto.card ?? dto) as Dto, cardId, grade)
  }
}
