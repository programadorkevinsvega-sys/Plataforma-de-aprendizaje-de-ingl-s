'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { Achievement, DashboardSummary, LeaderboardEntry } from '@/domain/entities/Progress'

export default function AchievementsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<'Todos' | 'Desbloqueados' | 'En progreso'>('Todos')
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
      setLeaders(ranking)
      setSummary(dashboard)
      setLoading(false)
    }
    void load().catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [router])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Cargando tus logros…</div>

  const unlocked = achievements.filter((achievement) => achievement.unlocked)
  const filtered = achievements.filter((achievement) => {
    if (filter === 'Desbloqueados') return achievement.unlocked
    if (filter === 'En progreso') return !achievement.unlocked
    return true
  })

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Logros y motivación</h1>
          <p className="mt-1 text-sm">Reconoce tus avances, mantén tu constancia y consulta tu posición.</p>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Misiones y actividad</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs">Racha actual</p><strong className="mt-1 block text-2xl">{summary?.streakDays ?? '—'} días</strong></div>
              <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs">Lecciones completadas</p><strong className="mt-1 block text-2xl">{summary?.lessonsCompleted ?? '—'}</strong></div>
              <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs">XP acumulados</p><strong className="mt-1 block text-2xl">{summary?.xp?.toLocaleString('es-CO') ?? '—'}</strong></div>
              <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs">Entrevistas realizadas</p><strong className="mt-1 block text-2xl">{summary?.interviewsTaken ?? '—'}</strong></div>
            </div>
            <p className="mt-3 text-xs">Las misiones diarias y semanales aún no tienen un planificador conectado a esta pantalla.</p>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Racha y medallas</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{unlocked.length} obtenidas</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {unlocked.slice(0, 6).map((achievement) => (
                <div key={achievement.id} className="rounded-xl border border-stone-200 p-4 text-center">
                  <div className="text-2xl">{achievement.emoji}</div>
                  <strong className="mt-2 block text-xs">{achievement.title}</strong>
                  <span className="mt-1 block text-[10px] text-emerald-800">Obtenida</span>
                </div>
              ))}
              {unlocked.length === 0 && <p className="col-span-full rounded-xl bg-stone-50 p-5 text-sm">Todavía no hay medallas desbloqueadas.</p>}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Medallas y logros</h2>
              <span className="text-xs">{unlocked.length}/{achievements.length}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['Todos', 'Desbloqueados', 'En progreso'] as const).map((value) => (
                <button key={value} onClick={() => setFilter(value)} className={'rounded-full border px-3 py-2 text-xs font-semibold ' + (filter === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-600')}>{value}</button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {filtered.map((achievement) => (
                <div key={achievement.id} className="flex items-start gap-3 rounded-xl border border-stone-100 p-3">
                  <span className={'grid h-10 w-10 place-items-center rounded-xl text-xl ' + (achievement.unlocked ? 'bg-emerald-50' : 'bg-stone-100 grayscale')}>{achievement.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{achievement.title}</strong>
                      <span className="text-[10px] font-semibold text-stone-500">{achievement.unlocked ? 'Obtenido' : achievement.progress + '/' + achievement.maxProgress}</span>
                    </div>
                    <p className="mt-1 text-xs">{achievement.description}</p>
                    {!achievement.unlocked && <div className="mt-2 h-1.5 rounded-full bg-stone-100"><div className="h-1.5 rounded-full bg-emerald-700" style={{ width: (achievement.maxProgress ? Math.min(100, achievement.progress / achievement.maxProgress * 100) : 0) + '%' }} /></div>}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <p className="rounded-xl bg-stone-50 p-5 text-sm">No hay logros en esta categoría.</p>}
            </div>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Clasificación</h2>
              <Link href="/leaderboard" className="text-xs font-bold text-emerald-800">Ver tabla completa →</Link>
            </div>
            <div className="mt-4 space-y-2">
              {leaders.slice(0, 5).map((leader) => (
                <div key={leader.userId} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-xs font-extrabold text-emerald-800">{leader.rank}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{leader.fullName}</strong>
                    <span className="text-xs">{leader.currentLevel}</span>
                  </span>
                  <strong className="text-sm">{leader.xp.toLocaleString('es-CO')} XP</strong>
                </div>
              ))}
              {!leaders.length && <p className="rounded-xl bg-stone-50 p-5 text-sm">Todavía no hay posiciones para mostrar.</p>}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-4">
              <strong className="text-sm">Historial de recompensas</strong>
              <p className="mt-1 text-xs">El historial detallado de XP y monedas aún no está expuesto por el backend.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
