'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { Achievement, DashboardSummary, LeaderboardEntry } from '@/domain/entities/Progress'

export default function AchievementsPage() {
  const router = useRouter()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const container = getContainer()
    const load = async () => {
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      const [badges, ranking, dashboard] = await Promise.all([
        container.useCases.getAchievements.execute().catch(() => []),
        container.useCases.getLeaderboard.execute().catch(() => []),
        container.useCases.getDashboardSummary.execute().catch(() => null),
      ])
      if (!active) return
      setAchievements(badges)
      setLeaders(ranking.map((entry) => ({ ...entry, isCurrentUser: entry.userId === user.id })))
      setSummary(dashboard)
    }
    void load().catch(() => undefined).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1 items-center justify-center text-sm">Cargando logros y motivación…</div>
    </div>
  )

  const unlocked = achievements.filter((achievement) => achievement.unlocked)
  const topLeaders = leaders.slice(0, 3)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Logros y motivación</h1>
          <p className="mt-1 text-sm">Misiones, rachas y clasificación.</p>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Misiones diarias</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">No hay misiones diarias configuradas.</p>
              <p className="mt-1 text-xs">Cuando exista el planificador de misiones, aquí verás tareas, objetivos y avance diario.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Misiones semanales</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">No hay misiones semanales configuradas.</p>
              <p className="mt-1 text-xs">Los objetivos semanales se mostrarán cuando el servicio de misiones esté conectado.</p>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Racha y calendario</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{summary?.streakDays ?? 0} días actuales</span>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2" aria-label="Calendario de actividad no disponible">
              {Array.from({ length: 35 }, (_, index) => (
                <span key={index} className="aspect-square rounded-lg border border-stone-200 bg-stone-50" title="Sin detalle diario disponible" />
              ))}
            </div>
            <p className="mt-3 text-xs">La plataforma conoce la racha actual, pero todavía no entrega el historial por fecha para pintar el calendario.</p>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Medallas</h2>
              <span className="text-xs">{unlocked.length} obtenidas</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {achievements.slice(0, 6).map((achievement) => (
                <div key={achievement.id} className="rounded-xl border border-stone-200 p-4 text-center">
                  <span className={'mx-auto grid h-11 w-11 place-items-center rounded-full text-xl ' + (achievement.unlocked ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 grayscale')}>{achievement.emoji || '★'}</span>
                  <strong className="mt-2 block text-xs">{achievement.title}</strong>
                  <span className="mt-1 block text-[10px]">{achievement.unlocked ? 'Obtenida' : 'Bloqueada'}</span>
                  {!achievement.unlocked && <span className="mt-1 block text-[10px]">{achievement.progress}/{achievement.maxProgress}</span>}
                </div>
              ))}
              {achievements.length === 0 && <p className="col-span-full rounded-xl bg-stone-50 p-5 text-sm">No hay medallas definidas todavía.</p>}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Clasificación</h2>
              <Link href="/leaderboard" className="text-xs font-bold text-emerald-800">Ver más →</Link>
            </div>
            <div className="mt-4 space-y-3">
              {topLeaders.map((entry) => (
                <div key={entry.userId} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-sm font-extrabold text-emerald-800">{entry.rank}</span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{entry.fullName}{entry.isCurrentUser ? ' · Tú' : ''}</strong>
                    <span className="text-xs">{entry.xp.toLocaleString('es-CO')} XP</span>
                  </div>
                  {entry.isCurrentUser && <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-800">Tu posición</span>}
                </div>
              ))}
              {!topLeaders.length && <p className="rounded-xl bg-stone-50 p-4 text-xs">Todavía no hay clasificación disponible.</p>}
            </div>
            <p className="mt-3 text-xs">La clasificación muestra los datos generales disponibles; no se calculan ligas ni temporadas.</p>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Historial de recompensas</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">Aún no hay un historial de recompensas disponible.</p>
              <p className="mt-1 text-xs">Cuando el backend exponga los movimientos de XP y monedas, aparecerán aquí.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
