import type { DashboardSummary, LeaderboardEntry, Achievement } from '@/domain/entities/Progress'
import type { IProgressRepository } from '@/domain/repositories/IProgressRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import { toDashboardSummary, toLeaderboardEntry, toAchievement } from '../api/mappers'

type Dto = Record<string, unknown>

/** Métricas agregadas de gamificación y progreso del alumno en PostgreSQL. */
export class BffProgressRepository implements IProgressRepository {
  constructor(private readonly http: BffHttpClient) {}

  async getDashboardSummary(): Promise<DashboardSummary> {
    const dto = await this.http.get<Dto>('/api/v1/progress/summary')
    return toDashboardSummary((dto.summary ?? dto) as Dto)
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const dtos = await this.http.get<Dto[]>('/api/v1/progress/leaderboard')
    return dtos.map(dto => toLeaderboardEntry(dto))
  }

  async getAchievements(): Promise<Achievement[]> {
    const dtos = await this.http.get<Dto[]>('/api/v1/progress/achievements')
    return dtos.map(dto => toAchievement(dto))
  }

  async recordLearningProgress(wordId: string): Promise<void> {
    await this.http.post<void>('/api/v1/progress/learn', { word_id: wordId })
  }
}
