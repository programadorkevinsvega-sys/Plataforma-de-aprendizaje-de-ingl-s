import type { DashboardSummary, LeaderboardEntry, Achievement } from '../entities/Progress'

export interface IProgressRepository {
  getDashboardSummary(): Promise<DashboardSummary>
  getLeaderboard(): Promise<LeaderboardEntry[]>
  getAchievements(): Promise<Achievement[]>
  recordLearningProgress(wordId: string): Promise<void>
}
