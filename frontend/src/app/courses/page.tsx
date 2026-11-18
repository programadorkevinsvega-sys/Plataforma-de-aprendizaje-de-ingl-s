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

type TrackFilter = 'all' | CurriculumTrackCode
type LevelFilter = 'all' | CurriculumLevel

const PAGE_SIZE = 9

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function trackLabel(track: CurriculumTrackCode): string {
  return track === 'technology' ? 'Inglés tecnológico' : 'Inglés general'
}

export default function CoursesPage() {
  const router = useRouter()
  const [track, setTrack] = useState<TrackFilter>('all')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [search, setSearch] = useState('')
  const [enrolledOnly, setEnrolledOnly] = useState(false)
  const [page, setPage] = useState(1)

  const loadCourses = useCallback(async (): Promise<CurriculumCoursePage> => {
    const container = getContainer()
    const user = await container.useCases.getCurrentUser.execute()
    if (!user) {
      router.replace('/login')
      return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    return container.useCases.getCurriculumCourses.execute({
      page,
      pageSize: PAGE_SIZE,
      trackCode: track === 'all' ? undefined : track,
      cefrLevel: level === 'all' ? undefined : level,
      search,
      enrolledOnly,
    })
  }, [enrolledOnly, level, page, router, search, track])

  const sessionUserId =
    typeof window === 'undefined'
      ? 'ssr'
      : (sessionStorageAdapter.read()?.user.id ?? 'anonymous')
  const cacheKey = [
    'curriculum-published-courses',
    sessionUserId,
    page,
    PAGE_SIZE,
    track,
    level,
    search.trim(),
    enrolledOnly,
  ].join(':')

  const {
    data,
    error,
    isLoading: loading,
    mutate,
  } = useSWR<CurriculumCoursePage>(cacheKey, loadCourses)

  const courses = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const changeTrack = (value: TrackFilter) => {
    setTrack(value)
    setPage(1)
  }

  const changeLevel = (value: LevelFilter) => {
    setLevel(value)
    setPage(1)
  }

  const changeSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const changeEnrolledOnly = (value: boolean) => {
    setEnrolledOnly(value)
    setPage(1)
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
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Catálogo de cursos
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Explora las rutas de inglés general y tecnológico. Filtra por nivel,
                  busca por nombre y continúa las versiones en las que estás matriculado.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <span className="text-2xl font-black text-white">{total}</span>
                <span className="ml-2 text-slate-400">versiones encontradas</span>
              </div>
            </div>
          </header>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5" aria-label="Filtros del catálogo">
            <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por ruta">
              {([
                ['all', 'Todos los cursos'],
                ['general', 'Inglés general'],
                ['technology', 'Inglés tecnológico'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeTrack(value)}
                  aria-pressed={track === value}
                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
                    track === value
                      ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-slate-950/60 text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Buscar curso
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => changeSearch(event.target.value)}
                  maxLength={120}
                  placeholder="Nombre, descripción o ruta…"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/50"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Nivel CEFR
                </span>
                <select
                  value={level}
                  onChange={(event) => changeLevel(event.target.value as LevelFilter)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50"
                >
                  <option value="all">Todos los niveles</option>
                  {(['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((value) => (
                    <option key={value} value={value}>{levelLabel(value)}</option>
                  ))}
                </select>
              </label>

              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-xs font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={enrolledOnly}
                  onChange={(event) => changeEnrolledOnly(event.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Mis matrículas
              </label>
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-center text-sm text-cyan-300" aria-live="polite">
              Consultando el catálogo…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6" role="alert">
              <h2 className="font-bold text-rose-200">No pudimos cargar el catálogo</h2>
              <p className="mt-2 text-sm text-rose-100/70">{error.message}</p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="mt-4 rounded-lg border border-rose-300/30 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-400/10"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && total === 0 && (
            <div className="glass-panel rounded-3xl border border-white/10 p-8 text-center sm:p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-3xl">
                📚
              </div>
              <h2 className="mt-5 text-xl font-extrabold text-white">
                {search || level !== 'all' || track !== 'all' || enrolledOnly
                  ? 'No hay cursos que coincidan con estos filtros'
                  : 'El catálogo curricular todavía no tiene cursos publicados'}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                {search || level !== 'all' || track !== 'all' || enrolledOnly
                  ? 'Prueba otra búsqueda o limpia los filtros para ver las versiones disponibles.'
                  : 'Los cursos aparecerán aquí cuando un paquete curricular real haya sido importado, revisado y publicado. No mostramos fixtures como contenido.'}
              </p>
              {(search || level !== 'all' || track !== 'all' || enrolledOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setTrack('all')
                    setLevel('all')
                    setSearch('')
                    setEnrolledOnly(false)
                    setPage(1)
                  }}
                  className="mt-5 rounded-xl border border-cyan-400/30 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {!loading && !error && courses.length > 0 && (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Cursos disponibles">
              {courses.map((course) => (
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
                      {course.status === 'archived' && (
                        <span className="ml-2 text-amber-300">· Archivada</span>
                      )}
                      {course.enrolled && (
                        <span className="ml-2 text-emerald-300">• Matriculado</span>
                      )}
                    </span>
                    <Link
                      href={`/courses/${encodeURIComponent(course.courseVersionId)}`}
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

          {!loading && !error && totalPages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5" aria-label="Paginación del catálogo">
              <span className="text-xs text-slate-500">
                Página {data?.page ?? page} de {totalPages} · {total} versiones
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </nav>
          )}
        </main>
      </div>
    </div>
  )
}
