'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'
import type { DashboardSummary } from '@/domain/entities/Progress'
import type { CurriculumCourseSummary } from '@/domain/repositories/ICurriculumRepository'

const competenceLabels = ['Vocabulario', 'Gramática', 'Reading', 'Listening', 'Speaking']

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [courses, setCourses] = useState<CurriculumCourseSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const container = getContainer()
    const load = async () => {
      try {
        const currentUser = await container.useCases.getCurrentUser.execute()
        if (!currentUser) {
          router.replace('/login')
          return
        }
        const [dashboard, enrolled] = await Promise.all([
          container.useCases.getDashboardSummary.execute(),
          container.useCases.getCurriculumCourses.execute({
            page: 1,
            pageSize: 4,
            enrolledOnly: true,
          }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 4, totalPages: 0 })),
        ])
        if (!active) return
        setUser(currentUser)
        setSummary(dashboard)
        setCourses(enrolled.items)
      } catch {
        if (active) setLoading(false)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [router])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Cargando tu espacio de aprendizaje…</div>
  }

  if (!user || !summary) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold">No pudimos cargar tu panel</h1>
        <p className="mt-2 text-sm">Comprueba tu sesión e inténtalo de nuevo.</p>
        <Link href="/login" className="btn-primary mt-5">Iniciar sesión</Link>
      </div>
    </div>
  )

  const firstName = user.firstName || user.fullName
  const todayItems = [
    ...(summary.dueReviews > 0 ? [{ title: 'Repaso de tarjetas', detail: summary.dueReviews + ' tarjetas pendientes', href: '/srs', kind: 'Repaso' }] : []),
    ...(summary.todayLesson ? [{ title: summary.todayLesson.title, detail: summary.todayLesson.topic, href: '/learn', kind: 'Lección' }] : []),
  ]
  const levelProgress = Math.max(0, Math.min(100, summary.levelProgressPercent))

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Buenos días, {firstName}</h1>
            <p className="mt-1 text-sm">Resumen de tu aprendizaje y de lo que puedes trabajar hoy.</p>
          </div>
          <Link href={summary.todayLesson ? '/learn' : '/courses'} className="btn-primary">
            {summary.todayLesson ? 'Continuar donde quedé' : 'Explorar cursos'} <span aria-hidden="true">→</span>
          </Link>
        </header>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumen de actividad">
          {[
            { label: 'Racha', value: summary.streakDays + ' días' },
            { label: 'XP acumulados', value: summary.xp.toLocaleString('es-CO') },
            { label: 'Monedas', value: summary.techCoins.toLocaleString('es-CO') },
            { label: 'Nivel actual', value: summary.currentLevel },
          ].map((stat) => (
            <article key={stat.label} className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-semibold">{stat.label}</p>
              <p className="mt-2 text-2xl font-extrabold">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Plan de estudio para hoy</h2>
              <span className="text-xs">Actividad disponible</span>
            </div>
            {todayItems.length ? (
              <div className="mt-4 divide-y divide-stone-100">
                {todayItems.map((item, index) => (
                  <Link key={item.href + item.title} href={item.href} className="flex items-center gap-4 rounded-lg px-2 py-4 first:pt-1 last:pb-1 hover:bg-stone-50">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{item.title}</strong>
                      <span className="mt-1 block text-xs">{item.detail}</span>
                    </span>
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-600">{item.kind}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-stone-50 p-5">
                <p className="text-sm font-semibold">No tienes actividades pendientes para hoy.</p>
                <p className="mt-1 text-xs">Puedes explorar el catálogo o practicar vocabulario.</p>
                <Link href="/courses" className="mt-3 inline-flex text-sm font-bold text-emerald-800">Explorar cursos →</Link>
              </div>
            )}
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Objetivos</h2>
              <Link href="/plan" className="text-xs font-bold text-emerald-800">Ver mi plan →</Link>
            </div>
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <strong>Progreso del nivel {summary.currentLevel}</strong>
                <span>{levelProgress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-emerald-700" style={{ width: levelProgress + '%' }} />
              </div>
              <p className="mt-2 text-xs">Avance registrado por la plataforma hacia el siguiente nivel.</p>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-stone-200 p-4">
              <strong className="text-sm">Objetivos diarios y semanales</strong>
              <p className="mt-1 text-xs">Todavía no hay metas personales configuradas para mostrar.</p>
              <Link href="/plan" className="mt-2 inline-flex text-xs font-bold text-emerald-800">Configurar objetivos →</Link>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Cursos en progreso</h2>
              <Link href="/courses" className="text-xs font-bold text-emerald-800">Ver catálogo →</Link>
            </div>
            {courses.length ? (
              <div className="mt-4 space-y-4">
                {courses.map((course) => (
                  <Link key={course.courseVersionId} href={'/courses/' + course.courseVersionId} className="block rounded-xl p-2 hover:bg-stone-50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold">{course.title}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">{course.cefrLevel}</span>
                    </div>
                    <p className="mt-1 text-xs">{course.unitCount} unidades · {course.lessonCount} lecciones</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-stone-50 p-5">
                <p className="text-sm font-semibold">Aún no tienes cursos activos.</p>
                <Link href="/courses" className="mt-2 inline-flex text-sm font-bold text-emerald-800">Buscar un curso →</Link>
              </div>
            )}
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Progreso por competencias</h2>
              <Link href="/evaluations" className="text-xs font-bold text-emerald-800">Evaluaciones →</Link>
            </div>
            <div className="mt-4 space-y-4">
              {competenceLabels.map((label) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-sm">
                    <strong>{label}</strong>
                    <span className="text-xs">Sin medición</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs">Las competencias se mostrarán cuando existan evaluaciones válidas para cada habilidad.</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Actividades pendientes</h2>
            {summary.dueReviews > 0 ? (
              <Link href="/srs" className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 p-4">
                <span><strong className="block text-sm">Repasos programados</strong><span className="mt-1 block text-xs">{summary.dueReviews} tarjetas pendientes</span></span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Pendiente</span>
              </Link>
            ) : (
              <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm">No hay actividades vencidas registradas.</p>
            )}
            {summary.todayLesson && (
              <Link href="/learn" className="mt-2 flex items-center justify-between rounded-xl p-4 hover:bg-stone-50">
                <span><strong className="block text-sm">{summary.todayLesson.title}</strong><span className="mt-1 block text-xs">{summary.todayLesson.topic}</span></span>
                <span className="text-xs font-bold text-emerald-800">Continuar →</span>
              </Link>
            )}
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Repasos programados</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-stone-100 p-4 text-center"><strong className="block text-2xl">{summary.dueReviews}</strong><span className="text-xs">Hoy</span></div>
              <div className="rounded-xl bg-stone-100 p-4 text-center"><strong className="block text-2xl">—</strong><span className="text-xs">Mañana</span></div>
              <div className="rounded-xl bg-stone-100 p-4 text-center"><strong className="block text-2xl">—</strong><span className="text-xs">Esta semana</span></div>
            </div>
            <Link href="/srs" className="mt-4 flex w-full justify-center rounded-xl border border-emerald-700/20 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-50">Iniciar repaso</Link>
          </article>
        </section>

        <section className="rounded-2xl bg-slate-800 p-6 text-white sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-200">Siguiente actividad recomendada</p>
              <h2 className="mt-2 text-xl font-bold text-white">{summary.todayLesson?.title || 'Práctica de vocabulario contextual'}</h2>
              <p className="mt-1 text-sm text-slate-200">{summary.todayLesson?.topic || 'Continúa practicando expresiones y pronunciación con el contenido disponible.'}</p>
            </div>
            <Link href="/learn" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600">Empezar</Link>
          </div>
        </section>
      </main>
    </div>
  )
}
