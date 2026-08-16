'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'
import type { Progress } from '@/domain/entities/Progress'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) {
        router.push('/login')
        return
      }
      setUser(u)
      container.useCases.getDashboardSummary.execute().then((p) => {
        setProgress(p)
        setLoading(false)
      })
    })
  }, [router])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-cyan-400 font-mono text-sm">
        ⚡ Cargando Panel Multi-Tenant para {user?.fullName || 'Desarrollador'}...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 max-w-6xl space-y-8">
          {/* Header Banner */}
          <div className="glass-panel p-8 rounded-3xl border border-white/10 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30">
                    🔒 Sesión Multi-Tenant Aislada
                  </span>
                  <span className="bg-cyan-500/20 text-cyan-300 text-xs font-bold px-3 py-1 rounded-full border border-cyan-500/30">
                    {user.targetRole}
                  </span>
                </div>
                <h1 className="text-3xl font-black text-white">
                  Bienvenido de nuevo, <span className="gradient-text">{user.fullName}</span> 👋
                </h1>
                <p className="text-xs text-slate-400">
                  ID de Usuario aislado en PostgreSQL RLS: <code className="text-cyan-300 font-mono">{user.id}</code> | Nivel Actual: <strong className="text-white">{user.currentLevel}</strong>
                </p>
              </div>

              <Link
                href="/learn"
                className="btn-primary text-center text-xs px-6 py-3"
              >
                Continuar Lección del Día →
              </Link>
            </div>
          </div>

          {/* Gamification Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-5 rounded-2xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400">Racha Diaria</span>
                <span className="text-xl">🔥</span>
              </div>
              <div className="text-2xl font-black text-amber-400">{progress?.streakDays ?? 0} Días</div>
              <p className="text-[10px] text-slate-400 mt-1">¡Mantén la racha para desbloquear badges!</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400">Monedas Tech</span>
                <span className="text-xl">💎</span>
              </div>
              <div className="text-2xl font-black text-cyan-400">{progress?.techCoins ?? 50} Monedas</div>
              <p className="text-[10px] text-slate-400 mt-1">Recompensas por lecciones y evaluaciones.</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400">Puntos de Experiencia</span>
                <span className="text-xl">⚡</span>
              </div>
              <div className="text-2xl font-black text-purple-400">{progress?.xp ?? 0} XP</div>
              <p className="text-[10px] text-slate-400 mt-1">Próximo Nivel B1 a los 3500 XP.</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400">Palabras Dominadas</span>
                <span className="text-xl">📚</span>
              </div>
              <div className="text-2xl font-black text-emerald-400">{progress?.wordsMastered ?? 0} Términos</div>
              <p className="text-[10px] text-slate-400 mt-1">De un banco de 8,000 frases técnicas.</p>
            </div>
          </div>

          {/* Module Grid Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/learn" className="glass-panel p-6 rounded-2xl border border-white/10 hover:border-cyan-500/50 transition-all group">
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">📚</div>
              <h3 className="text-lg font-extrabold text-white mb-1 group-hover:text-cyan-400">Lecciones Fonéticas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aprende palabras técnicas con 3-5 oraciones conversacionales reales y fonética en español sin IPA.
              </p>
            </Link>

            <Link href="/interview" className="glass-panel p-6 rounded-2xl border border-white/10 hover:border-purple-500/50 transition-all group">
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🤖</div>
              <h3 className="text-lg font-extrabold text-white mb-1 group-hover:text-purple-400">Simulador Entrevista IA</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Práctica preguntas con reclutadores de EE. UU. (AWS Bedrock) y evalúa tus 6 Métricas con target ≥ 90%.
              </p>
            </Link>

            <Link href="/srs" className="glass-panel p-6 rounded-2xl border border-white/10 hover:border-emerald-500/50 transition-all group">
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🧠</div>
              <h3 className="text-lg font-extrabold text-white mb-1 group-hover:text-emerald-400">Repetición Anki SM-2</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Repasa tarjetas de memoria justo antes de que tu cerebro las olvide con el algoritmo SM-2.
              </p>
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}
