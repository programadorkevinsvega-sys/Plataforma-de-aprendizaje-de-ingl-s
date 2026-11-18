import type { SrsCard, SrsGrade, SrsReviewOutcome } from '../entities/SrsCard'

export interface ISrsRepository {
  /** Tarjetas vencidas hoy para el tenant en sesión. */
  getDueCards(limit?: number): Promise<SrsCard[]>
  reviewCard(cardId: string, grade: SrsGrade): Promise<SrsReviewOutcome>
}
