import type { LeaderboardEntry } from '@/domain/entities/Progress'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'

export class GetLeaderboardUseCase {
  constructor(private readonly progressRepository: IProgressRepository) {}

  async execute(): Promise<LeaderboardEntry[]> {
    return this.progressRepository.getLeaderboard()
  }
}
