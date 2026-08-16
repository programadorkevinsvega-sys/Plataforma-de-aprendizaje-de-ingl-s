'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'

// Removed ACHIEVEMENTS mock

export default function AchievementsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<'Todos' | 'Desbloqueados' | 'En Progreso'>('Todos')
  const [loading, setLoading] = useState(true)
  const [achievements, setAchievements] = useState<import('@/domain/entities/Progress').Achievement[]>([])

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      container.useCases.getAchievements.execute().then(data => {
        setAchievements(data)
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    })
  }, [router])

  const filtered = achievements.filter(a => {
    if (filter === 'Desbloqueados') return a.unlocked
    if (filter === 'En Progreso') return !a.unlocked
    return true
  })

  const unlockedCount = achievements.filter(a => a.unlocked).length

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-yellow-400 font-mono text-sm">
      🏆 Cargando Logros...
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-panel p-8 rounded-3xl border border-yellow-500/20 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black text-white">🏆 Logros & Badges</h1>
              <p className="text-xs text-slate-400 mt-1">Tu progreso en el camino hacia el inglés técnico profesional</p>
            </div>
            <div className="glass-panel px-6 py-3 rounded-2xl border border-yellow-500/30 text-center">
              <div className="text-2xl font-black text-yellow-400">{unlockedCount}/{achievements.length || 1}</div>
              <div className="text-xs text-slate-400">Desbloqueados</div>
            </div>
          </div>

          {/* Master progress bar */}
          <div className="mt-4">
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-yellow-500 to-amber-400 h-2 rounded-full transition-all"
                style={{ width: `${(unlockedCount / (achievements.length || 1)) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1 text-right">{Math.round((unlockedCount / (achievements.length || 1)) * 100)}% completado</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(['Todos', 'Desbloqueados', 'En Progreso'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${filter === f ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Achievement grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(a => (
            <div
              key={a.id}
              className={`glass-panel p-5 rounded-2xl border transition-all ${a.unlocked ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 opacity-75'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`text-3xl w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${a.unlocked ? 'bg-yellow-500/20' : 'bg-slate-800 grayscale'}`}>
                  {a.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${a.unlocked ? 'text-white' : 'text-slate-400'}`}>{a.title}</span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{a.category}</span>
                    {a.unlocked && <span className="text-[10px] text-yellow-400">✓ Desbloqueado</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.description}</p>
                  {!a.unlocked && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Progreso</span>
                        <span>{a.progress}/{a.maxProgress}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5">
                        <div
                          className="bg-gradient-to-r from-slate-500 to-slate-400 h-1.5 rounded-full"
                          style={{ width: `${Math.min((a.progress / a.maxProgress) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
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
