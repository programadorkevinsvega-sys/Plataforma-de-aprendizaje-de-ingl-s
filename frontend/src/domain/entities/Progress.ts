import { METRIC_KEYS, type MetricKey, type MetricScores } from './ExamResult'
import type { CefrLevel } from './User'

export interface MetricPoint {
  date: string
  scores: MetricScores
}

export interface DashboardSummaryProps {
  streakDays: number
  techCoins: number
  xp?: number
  currentLevel: CefrLevel
  levelProgressPercent: number
  wordsMastered: number
  dueReviews: number
  lessonsCompleted: number
  interviewsTaken: number
  bestOverallScore: number
  currentMetrics: MetricScores
  history?: MetricPoint[]
  todayLesson?: {
    id: string
    title: string
    topic: string
    wordCount: number
  } | null
}

export class DashboardSummary {
  readonly streakDays: number
  readonly techCoins: number
  readonly xp: number
  readonly currentLevel: CefrLevel
  readonly levelProgressPercent: number
  readonly wordsMastered: number
  readonly dueReviews: number
  readonly lessonsCompleted: number
  readonly interviewsTaken: number
  readonly bestOverallScore: number
  readonly currentMetrics: MetricScores
  readonly history: MetricPoint[]
  readonly todayLesson: DashboardSummaryProps['todayLesson']

  constructor(props: DashboardSummaryProps) {
    this.streakDays = props.streakDays ?? 0
    this.techCoins = props.techCoins ?? 0
    this.xp = props.xp ?? 0
    this.currentLevel = props.currentLevel
    this.levelProgressPercent = props.levelProgressPercent ?? 0
    this.wordsMastered = props.wordsMastered ?? 0
    this.dueReviews = props.dueReviews ?? 0
    this.lessonsCompleted = props.lessonsCompleted ?? 0
    this.interviewsTaken = props.interviewsTaken ?? 0
    this.bestOverallScore = props.bestOverallScore ?? 0
    this.currentMetrics = props.currentMetrics
    this.history = props.history ?? []
    this.todayLesson = props.todayLesson ?? null
  }

  get weakestMetric(): MetricKey {
    return [...METRIC_KEYS].sort(
      (a, b) => (this.currentMetrics[a] ?? 0) - (this.currentMetrics[b] ?? 0),
    )[0]!
  }

  get strongestMetric(): MetricKey {
    return [...METRIC_KEYS].sort(
      (a, b) => (this.currentMetrics[b] ?? 0) - (this.currentMetrics[a] ?? 0),
    )[0]!
  }
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  fullName: string
  currentLevel: CefrLevel
  xp: number
  streakDays: number
  isCurrentUser?: boolean
}

export interface Achievement {
  id: string
  emoji: string
  title: string
  description: string
  unlocked: boolean
  progress: number
  maxProgress: number
  category: string
}
