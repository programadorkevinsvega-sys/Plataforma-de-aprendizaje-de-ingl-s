import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'

export class RecordLearningProgressUseCase {
  constructor(private readonly progressRepository: IProgressRepository) {}

  execute(wordId: string): Promise<void> {
    return this.progressRepository.recordLearningProgress(wordId)
  }
}
