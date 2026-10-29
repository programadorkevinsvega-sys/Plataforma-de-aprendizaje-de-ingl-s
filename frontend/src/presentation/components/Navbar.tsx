'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'

interface LiveStats {
  xp: number
  streakDays: number
  techCoins: number
}

export const Navbar: React.FC = () => {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<LiveStats>({ xp: 0, streakDays: 0, techCoins: 0 })

  const fetchStats = async () => {
    try {
      const container = getContainer()
      const summary = await container.useCases.getDashboardSummary.execute()
      setStats({
        xp: summary.xp,
        streakDays: summary.streakDays,
        techCoins: summary.techCoins,
      })
    } catch {
      // silencioso — no romper la UI si falla
    }
  }

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      setUser(u)
    })
    container.useCases.getDashboardSummary.execute().then((summary) => {
      setStats({
        xp: summary.xp,
        streakDays: summary.streakDays,
        techCoins: summary.techCoins,
      })
    }).catch(() => {
      // silencioso — no romper la UI si falla
    })

    // Escuchar evento de XP actualizado desde /learn, /srs, /interview, etc.
    const onXpUpdated = () => fetchStats()
    window.addEventListener('devfluency:xp-updated', onXpUpdated)
    return () => window.removeEventListener('devfluency:xp-updated', onXpUpdated)
  }, [])

  const handleLogout = async () => {
    const container = getContainer()
    await container.useCases.logout.execute()
    router.push('/login')
  }

  return (
    <header className="w-full glass-panel sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between border-b border-white/10">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-black text-black text-lg shadow-lg shadow-cyan-500/20">
            DF
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight gradient-text">DevFluency AI</h1>
            <p className="text-[10px] text-slate-400 font-medium">Conversational English for Software Engineers</p>
          </div>
        </Link>
      </div>

      {user && (
        <div className="flex items-center gap-4">
          {/* Racha */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 font-bold text-xs">
            <span>🔥</span>
            <span>{stats.streakDays} {stats.streakDays === 1 ? 'Día' : 'Días'} Racha</span>
          </div>

          {/* Monedas */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 font-bold text-xs">
            <span>💎</span>
            <span>{stats.techCoins} Monedas</span>
          </div>

          {/* XP */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 font-bold text-xs">
            <span>⚡</span>
            <span>{stats.xp} XP</span>
          </div>

          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm">
            {user.targetRole || 'Software Engineer'} ({user.currentLevel || 'A0'})
          </div>

          {/* User Dropdown / Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <span className="text-xs text-slate-300 font-semibold hidden md:inline">{user.fullName}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg font-bold text-xs transition-all"
              title="Cerrar Sesión"
            >
              Salir 🚪
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
