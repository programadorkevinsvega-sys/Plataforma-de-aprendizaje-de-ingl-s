'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type {
  CurriculumCourseSummary,
  CurriculumTrackCode,
} from '@/domain/repositories/ICurriculumRepository'

type TrackFilter = 'all' | CurriculumTrackCode

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function trackLabel(track: CurriculumTrackCode): string {
  return track === 'technology' ? 'Inglés tecnológico' : 'Inglés general'
}

export default function CoursesPage() {
  const router = useRouter()
  const [courses, setCourses] = useState<CurriculumCourseSummary[]>([])
  const [track, setTrack] = useState<TrackFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCourses = async () => {
    setLoading(true)
    setError(null)
    try {
      const container = getContainer()
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      const result = await container.useCases.getCurriculumCourses.execute()
      setCourses(result)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo cargar el catálogo curricular.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCourses()
    // The initial fetch is intentionally tied to the page lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleCourses = useMemo(
    () => (track === 'all' ? courses : courses.filter((course) => course.trackCode === track)),
    [courses, track],
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 p-5 sm:p-8 max-w-7xl space-y-8">
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              <span>🧭</span>
              Ruta académica
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Catálogo de cursos
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Explora las rutas de inglés general y tecnológico. Cada curso muestra su
                  nivel, unidades, lecciones y objetivos antes de comenzar.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <span className="text-2xl font-black text-white">{courses.length}</span>
                <span className="ml-2 text-slate-400">versiones publicadas</span>
              </div>
            </div>
          </header>

          <section className="flex flex-wrap items-center gap-2" aria-label="Filtrar cursos">
            {([
              ['all', 'Todos los cursos'],
              ['general', 'Inglés general'],
              ['technology', 'Inglés tecnológico'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTrack(value)}
                aria-pressed={track === value}
                className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
                  track === value
                    ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </section>

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-center text-sm text-cyan-300" aria-live="polite">
              Cargando los cursos publicados…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6" role="alert">
              <h2 className="font-bold text-rose-200">No pudimos cargar el catálogo</h2>
              <p className="mt-2 text-sm text-rose-100/70">{error}</p>
              <button
                type="button"
                onClick={() => void loadCourses()}
                className="mt-4 rounded-lg border border-rose-300/30 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-400/10"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && courses.length === 0 && (
            <div className="glass-panel rounded-3xl border border-white/10 p-8 text-center sm:p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-3xl">
                📚
              </div>
              <h2 className="mt-5 text-xl font-extrabold text-white">
                El catálogo curricular todavía no tiene cursos publicados
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                La estructura académica y el flujo de publicación ya existen en el backend.
                Los cursos aparecerán aquí cuando un paquete de contenido real haya sido
                importado, revisado y publicado. No mostramos datos de demostración como si
                fueran cursos disponibles.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs font-semibold text-amber-200">
                <span>⏳</span>
                Contenido editorial pendiente de publicación
              </div>
            </div>
          )}

          {!loading && !error && courses.length > 0 && visibleCourses.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              No hay cursos publicados para este tipo de ruta.
            </div>
          )}

          {!loading && !error && visibleCourses.length > 0 && (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Cursos disponibles">
              {visibleCourses.map((course) => (
                <article
                  key={course.courseVersionId}
                  className="glass-panel group flex flex-col rounded-3xl border border-white/10 p-6 transition-all hover:-translate-y-0.5 hover:border-cyan-400/30 sm:p-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      course.trackCode === 'technology'
                        ? 'border-violet-400/20 bg-violet-400/10 text-violet-200'
                        : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200'
                    }`}>
                      {trackLabel(course.trackCode)}
                    </span>
                    <span className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-black text-white">
                      {levelLabel(course.cefrLevel)}
                    </span>
                  </div>

                  <h2 className="mt-5 text-xl font-extrabold text-white group-hover:text-cyan-200">
                    {course.title}
                  </h2>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">
                    {course.description || 'Ruta formativa estructurada por unidades y objetivos de aprendizaje.'}
                  </p>

                  <div className="mt-6 grid grid-cols-3 gap-3 border-y border-white/10 py-4">
                    <div>
                      <div className="text-xl font-black text-white">{course.unitCount}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Unidades</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-white">{course.lessonCount}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Lecciones</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-white">{course.estimatedMinutes || '—'}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                        {course.estimatedMinutes ? 'Minutos' : 'Duración'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      Versión {course.versionNumber}
                      {course.enrolled && (
                        <span className="ml-2 text-emerald-300">• Matriculado</span>
                      )}
                    </span>
                    <Link
                      href={`/courses/${encodeURIComponent(course.slug)}/${course.cefrLevel}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-cyan-300"
                    >
                      Ver ruta
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
