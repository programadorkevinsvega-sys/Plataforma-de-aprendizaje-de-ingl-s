'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'

// Removed MOCK_LEADERS

const LEVEL_COLORS: Record<string, string> = {
  C1: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  B2: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  B1: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  A2: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  A1: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  A0: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leaders, setLeaders] = useState<import('@/domain/entities/Progress').LeaderboardEntry[]>([])

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      container.useCases.getLeaderboard.execute().then(data => {
        // Mark current user
        const mapped = data.map(d => ({
          ...d,
          isCurrentUser: d.userId === u.id
        }))
        setLeaders(mapped)
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    })
  }, [router])

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-amber-400 font-mono text-sm">
      🏆 Cargando Rankings...
    </div>
  )

  const rankEmoji = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-panel p-8 rounded-3xl border border-amber-500/20 relative overflow-hidden text-center">
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="text-5xl mb-3">🏆</div>
            <h1 className="text-2xl font-black text-white">Leaderboard Global</h1>
            <p className="text-xs text-slate-400 mt-1">Rankings de desarrolladores hispanohablantes por nivel de inglés técnico</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['Global', 'Esta Semana', 'Este Mes', 'Por Nivel'].map(f => (
            <button
              key={f}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${f === 'Global' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Leaderboard List */}
        <div className="space-y-3">
          {leaders.map((entry) => (
            <div
              key={entry.userId}
              className={`glass-panel p-4 rounded-2xl border transition-all flex items-center gap-4 ${entry.isCurrentUser ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/10'}`}
            >
              <div className={`text-xl font-black w-10 text-center flex-shrink-0 ${entry.rank <= 3 ? '' : 'text-slate-500'}`}>
                {rankEmoji(entry.rank)}
              </div>

              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0">
                {entry.fullName.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${entry.isCurrentUser ? 'text-cyan-300' : 'text-white'}`}>
                    {entry.fullName}
                    {entry.isCurrentUser && <span className="text-xs text-cyan-500 ml-1">(Tú)</span>}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${LEVEL_COLORS[entry.currentLevel] || LEVEL_COLORS['A0']}`}>
                    {entry.currentLevel}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-400">⚡ {entry.xp.toLocaleString()} XP</span>
                  <span className="text-xs text-amber-400">🔥 {entry.streakDays} días</span>
                </div>
              </div>

              <div className="w-16">
                <div className="w-full bg-slate-800 rounded-full h-1">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-yellow-400 h-1 rounded-full"
                    style={{ width: `${Math.min((entry.xp / 15000) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center pt-2">
          <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
