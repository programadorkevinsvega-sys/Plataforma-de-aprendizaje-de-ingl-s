import type { Achievement } from '@/domain/entities/Progress'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'

export class GetAchievementsUseCase {
  constructor(private readonly progressRepository: IProgressRepository) {}

  async execute(): Promise<Achievement[]> {
    return this.progressRepository.getAchievements()
  }
}
