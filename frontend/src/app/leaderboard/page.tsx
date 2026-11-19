'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { LeaderboardEntry } from '@/domain/entities/Progress'

export default function LeaderboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    let active = true
    const container = getContainer()
    const load = async () => {
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      const data = await container.useCases.getLeaderboard.execute()
      if (active) setLeaders(data.map((entry) => ({ ...entry, isCurrentUser: entry.userId === user.id })))
    }
    void load().catch(() => undefined).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [router])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Clasificación</h1>
          <p className="mt-1 text-sm">Posiciones según los puntos de experiencia registrados.</p>
        </header>

        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Liga actual</h2>
          {loading ? (
            <p className="mt-4 text-sm">Cargando clasificación…</p>
          ) : leaders.length ? (
            <div className="mt-4 space-y-2">
              {leaders.map((entry) => (
                <div key={entry.userId} className={'flex items-center gap-3 rounded-xl p-3 ' + (entry.isCurrentUser ? 'bg-emerald-50' : 'bg-stone-50')}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-extrabold text-emerald-800">{entry.rank}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{entry.fullName}{entry.isCurrentUser ? ' · Tú' : ''}</strong>
                    <span className="text-xs">Nivel {entry.currentLevel} · Racha {entry.streakDays} días</span>
                  </span>
                  <strong className="text-sm">{entry.xp.toLocaleString('es-CO')} XP</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-stone-50 p-5 text-sm">Todavía no hay posiciones para mostrar.</p>
          )}
          <p className="mt-4 text-xs">El servicio disponible solo entrega la clasificación general. No hay filtros históricos por semana o mes.</p>
        </section>

        <div className="text-right">
          <Link href="/achievements" className="text-sm font-semibold text-emerald-800">Volver a Logros y motivación →</Link>
        </div>
      </main>
    </div>
  )
}
