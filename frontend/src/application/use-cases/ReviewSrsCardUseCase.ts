import type { SrsCard, SrsGrade, SrsReviewOutcome } from '@/domain/entities/SrsCard'
import type { ISrsRepository } from '@/domain/repositories/ISrsRepository'

export class GetDueCardsUseCase {
  constructor(private readonly srsRepository: ISrsRepository) {}

  async execute(limit = 30): Promise<SrsCard[]> {
    const cards = await this.srsRepository.getDueCards(limit)
    // Las tarjetas nuevas van al final: primero se consolida lo ya visto.
    return [...cards].sort((a, b) => Number(a.isNew) - Number(b.isNew))
  }
}

export class ReviewSrsCardUseCase {
  constructor(private readonly srsRepository: ISrsRepository) {}

  execute(cardId: string, grade: SrsGrade): Promise<SrsReviewOutcome> {
    return this.srsRepository.reviewCard(cardId, grade)
  }
}
