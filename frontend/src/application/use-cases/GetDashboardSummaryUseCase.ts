import type { DashboardSummary } from '@/domain/entities/Progress'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'

export class GetDashboardSummaryUseCase {
  constructor(private readonly progressRepository: IProgressRepository) {}

  execute(): Promise<DashboardSummary> {
    return this.progressRepository.getDashboardSummary()
  }
}
