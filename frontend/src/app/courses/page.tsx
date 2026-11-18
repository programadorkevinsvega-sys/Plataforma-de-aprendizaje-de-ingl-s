'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import { sessionStorageAdapter } from '@/infrastructure/storage/SessionStorage'
import type {
  CurriculumCoursePage,
  CurriculumLevel,
  CurriculumTrackCode,
} from '@/domain/repositories/ICurriculumRepository'

const PAGE_SIZE = 12

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function trackLabel(track: CurriculumTrackCode): string {
  return track === 'technology' ? 'Inglés tecnológico' : 'Inglés general'
}

export default function CoursesPage() {
  const router = useRouter()
  const [track, setTrack] = useState<'all' | CurriculumTrackCode>('all')
  const [level, setLevel] = useState<'all' | CurriculumLevel>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const query = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(track === 'all' ? {} : { track }),
    ...(level === 'all' ? {} : { level }),
    ...(search ? { search } : {}),
  }
  const key = [
    'curriculum-published-courses',
    typeof window === 'undefined' ? 'ssr' : (sessionStorageAdapter.read()?.user.id ?? 'anonymous'),
    JSON.stringify(query),
  ].join(':')

  const loadCourses = useCallback(async (): Promise<CurriculumCoursePage> => {
    const container = getContainer()
    const user = await container.useCases.getCurrentUser.execute()
    if (!user) {
      router.replace('/login')
      return { items: [], total: 0, limit: PAGE_SIZE, offset: 0 }
    }
    return container.useCases.getCurriculumCourses.execute(query)
  }, [query.limit, query.offset, query.track, query.level, query.search, router])

  const {
    data,
    error,
    isLoading: loading,
    mutate,
  } = useSWR<CurriculumCoursePage>(key, loadCourses)
  const courses = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const updateFilter = (callback: () => void) => {
    callback()
    setPage(0)
  }

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
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Catálogo de cursos</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Explora las rutas de inglés general y tecnológico. Cada curso muestra su nivel,
                  unidades, lecciones y objetivos antes de comenzar.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <span className="text-2xl font-black text-white">{total}</span>
                <span className="ml-2 text-slate-400">versiones encontradas</span>
              </div>
            </div>
          </header>

          <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]" aria-label="Filtros remotos del catálogo">
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); updateFilter(() => setSearch(searchInput.trim())) }}>
              <input
                aria-label="Buscar cursos"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                maxLength={100}
                placeholder="Buscar por nombre…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
              />
              <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-extrabold text-slate-950">Buscar</button>
            </form>
            <select
              aria-label="Filtrar por ruta"
              value={track}
              onChange={(event) => updateFilter(() => setTrack(event.target.value as 'all' | CurriculumTrackCode))}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="all">Todas las rutas</option>
              <option value="general">Inglés general</option>
              <option value="technology">Inglés tecnológico</option>
            </select>
            <select
              aria-label="Filtrar por nivel CEFR"
              value={level}
              onChange={(event) => updateFilter(() => setLevel(event.target.value as 'all' | CurriculumLevel))}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="all">Todos los niveles</option>
              {(['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((item) => (
                <option key={item} value={item}>{levelLabel(item)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => updateFilter(() => { setSearch(''); setSearchInput(''); setTrack('all'); setLevel('all') })}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-white/30"
            >
              Limpiar
            </button>
          </section>

          {loading && <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-center text-sm text-cyan-300" aria-live="polite">Consultando el catálogo…</div>}
          {!loading && error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6" role="alert">
              <h2 className="font-bold text-rose-200">No pudimos cargar el catálogo</h2>
              <p className="mt-2 text-sm text-rose-100/70">{error instanceof Error ? error.message : 'Error de consulta'}</p>
              <button type="button" onClick={() => void mutate()} className="mt-4 rounded-lg border border-rose-300/30 px-4 py-2 text-xs font-bold text-rose-100">Reintentar</button>
            </div>
          )}

          {!loading && !error && total === 0 && (
            <div className="glass-panel rounded-3xl border border-white/10 p-8 text-center sm:p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-3xl">📚</div>
              <h2 className="mt-5 text-xl font-extrabold text-white">No encontramos cursos con estos filtros</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Ajusta la ruta, el nivel o el texto de búsqueda. Solo aparecen versiones publicadas y las versiones archivadas en las que ya estás matriculado.
              </p>
            </div>
          )}

          {!loading && !error && courses.length > 0 && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Cursos disponibles">
                {courses.map((course) => (
                  <article key={course.courseVersionId} className="glass-panel group flex flex-col rounded-3xl border border-white/10 p-6 transition-all hover:-translate-y-0.5 hover:border-cyan-400/30 sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${course.trackCode === 'technology' ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200'}`}>
                        {trackLabel(course.trackCode)}
                      </span>
                      <span className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-black text-white">{levelLabel(course.cefrLevel)}</span>
                    </div>
                    <h2 className="mt-5 text-xl font-extrabold text-white group-hover:text-cyan-200">{course.title}</h2>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{course.description || 'Ruta formativa estructurada por unidades y objetivos de aprendizaje.'}</p>
                    <div className="mt-6 grid grid-cols-3 gap-3 border-y border-white/10 py-4">
                      <div><div className="text-xl font-black text-white">{course.unitCount}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Unidades</div></div>
                      <div><div className="text-xl font-black text-white">{course.lessonCount}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Lecciones</div></div>
                      <div><div className="text-xl font-black text-white">{course.estimatedMinutes || '—'}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{course.estimatedMinutes ? 'Minutos' : 'Duración'}</div></div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">
                        Versión {course.versionNumber}
                        {course.status === 'archived' && <span className="ml-2 text-amber-300">· Archivada</span>}
                        {course.enrolled && <span className="ml-2 text-emerald-300">• Matriculado</span>}
                      </span>
                      <Link href={`/courses/${encodeURIComponent(course.courseVersionId)}`} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-cyan-300">
                        Ver ruta <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </section>
              <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4" aria-label="Paginación del catálogo">
                <p className="text-xs text-slate-400">
                  Mostrando {query.offset + 1}–{Math.min(query.offset + courses.length, total)} de {total}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40">Anterior</button>
                  <span className="px-2 text-xs text-slate-300">Página {page + 1} de {pageCount}</span>
                  <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40">Siguiente</button>
                </div>
              </nav>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
