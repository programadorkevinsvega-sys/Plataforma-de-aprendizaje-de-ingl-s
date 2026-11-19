'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import { sessionStorageAdapter } from '@/infrastructure/storage/SessionStorage'
import type {
  CurriculumCourseDetail,
  CurriculumCoursePage,
  CurriculumLevel,
  CurriculumTrackCode,
} from '@/domain/repositories/ICurriculumRepository'

type TrackFilter = 'all' | CurriculumTrackCode
type LevelFilter = 'all' | CurriculumLevel

const PAGE_SIZE = 9
const LEVELS: CurriculumLevel[] = ['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const EMPTY_COURSES: CurriculumCoursePage['items'] = []

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function trackLabel(track: CurriculumTrackCode): string {
  return track === 'technology' ? 'Profesional y tecnológico' : 'Inglés general'
}

export default function CoursesPage() {
  const router = useRouter()
  const [track, setTrack] = useState<TrackFilter>('all')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedCourseId, setSelectedCourseId] = useState('')

  const sessionUserId = typeof window === 'undefined'
    ? 'ssr'
    : (sessionStorageAdapter.read()?.user.id ?? 'anonymous')

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
      enrolledOnly: false,
    })
  }, [level, page, router, search, track])

  const { data, error, isLoading, mutate } = useSWR<CurriculumCoursePage>(
    ['curriculum-public-courses', sessionUserId, page, track, level, search.trim()],
    loadCourses,
  )

  const courses = data?.items ?? EMPTY_COURSES
  const activeCourseId = courses.some((course) => course.courseVersionId === selectedCourseId)
    ? selectedCourseId
    : (courses[0]?.courseVersionId ?? '')
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const loadSelectedCourse = useCallback(async (): Promise<CurriculumCourseDetail | null> => {
    if (!activeCourseId) return null
    return getContainer().useCases.getCurriculumCourse.execute(activeCourseId)
  }, [activeCourseId])

  const { data: selectedDetail, isLoading: detailLoading } = useSWR<CurriculumCourseDetail | null>(
    activeCourseId ? ['curriculum-course-detail', activeCourseId] : null,
    loadSelectedCourse,
  )

  const loadEnrolled = useCallback(async (): Promise<CurriculumCoursePage> => {
    const user = await getContainer().useCases.getCurrentUser.execute()
    if (!user) return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }
    return getContainer().useCases.getCurriculumCourses.execute({
      page: 1,
      pageSize: 50,
      enrolledOnly: true,
    })
  }, [])

  const { data: enrolledData } = useSWR<CurriculumCoursePage>(
    ['curriculum-enrolled-history', sessionUserId],
    loadEnrolled,
  )

  const resetFilters = () => {
    setTrack('all')
    setLevel('all')
    setSearch('')
    setPage(1)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Catálogo de cursos</h1>
            <p className="mt-1 text-sm">Inglés general, profesional y tecnológico.</p>
          </div>
          <label className="w-full sm:w-64">
            <span className="sr-only">Buscar cursos</span>
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              maxLength={120}
              placeholder="Buscar cursos"
              className="w-full rounded-xl border px-4 py-3 text-sm"
            />
          </label>
        </header>

        <section className="space-y-3" aria-label="Filtros del catálogo">
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'Todos'],
              ['general', 'Inglés general'],
              ['technology', 'Profesional y tecnológico'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTrack(value); setPage(1) }}
                aria-pressed={track === value}
                className={'rounded-xl border px-4 py-2.5 text-xs font-semibold ' + (track === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-700')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {LEVELS.filter((item) => item !== 'PRE_A1').map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setLevel(item === level ? 'all' : item); setPage(1) }}
                aria-pressed={level === item}
                className={'rounded-xl border px-4 py-2.5 text-xs font-semibold ' + (level === item ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-700')}
              >
                {levelLabel(item)}
              </button>
            ))}
            <select
              aria-label="Filtrar nivel adicional"
              value={level === 'PRE_A1' || level === 'C2' ? level : 'all'}
              onChange={(event) => { setLevel(event.target.value as LevelFilter); setPage(1) }}
              className="rounded-xl border px-4 py-2.5 text-xs"
            >
              <option value="all">Todas las rutas</option>
              <option value="PRE_A1">Pre-A1</option>
              <option value="C2">C2</option>
            </select>
          </div>
        </section>

        {isLoading && <div className="glass-panel rounded-2xl p-8 text-center text-sm">Cargando cursos publicados…</div>}
        {error && (
          <div role="alert" className="glass-panel rounded-2xl p-6">
            <p className="text-sm font-semibold">No pudimos cargar el catálogo.</p>
            <p className="mt-1 text-xs">{error.message}</p>
            <button onClick={() => void mutate()} className="btn-primary mt-4">Reintentar</button>
          </div>
        )}

        {!isLoading && !error && courses.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <h2 className="text-lg font-bold">No hay cursos publicados para estos filtros</h2>
            <p className="mt-2 text-sm">El catálogo muestra únicamente contenido curricular real que haya sido revisado y publicado.</p>
            {(search || track !== 'all' || level !== 'all') && <button onClick={resetFilters} className="btn-primary mt-4">Limpiar filtros</button>}
          </div>
        )}

        {!isLoading && !error && courses.length > 0 && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cursos disponibles">
              {courses.map((course) => {
                const selected = activeCourseId === course.courseVersionId
                return (
                  <article key={course.courseVersionId} className={'glass-panel flex flex-col rounded-2xl p-4 ' + (selected ? 'border-emerald-700/50' : '')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-800">{levelLabel(course.cefrLevel)}</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">{course.enrolled ? 'Matriculado' : 'Disponible'}</span>
                    </div>
                    <h2 className="mt-4 text-base font-bold">{course.title}</h2>
                    <p className="mt-2 min-h-10 text-xs leading-5">{course.description || trackLabel(course.trackCode)}</p>
                    <p className="mt-4 text-[11px] text-stone-500">{course.unitCount} unidades · {course.lessonCount} lecciones</p>
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedCourseId(course.courseVersionId)}
                        className={'rounded-xl border py-2.5 text-xs font-bold ' + (selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-700/20 text-emerald-800')}
                      >
                        {selected ? 'Seleccionado' : 'Ver detalle'}
                      </button>
                      <Link href={'/courses/' + encodeURIComponent(course.courseVersionId)} className="rounded-xl border border-emerald-700/20 py-2.5 text-center text-xs font-bold text-emerald-800">
                        Ver curso
                      </Link>
                    </div>
                  </article>
                )
              })}
            </section>
            {totalPages > 1 && (
              <nav aria-label="Paginación del catálogo" className="flex items-center justify-between border-t border-stone-200 pt-4">
                <span className="text-xs">Página {data?.page ?? page} de {totalPages} · {total} cursos</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border px-4 py-2 text-xs font-semibold disabled:opacity-40">Anterior</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border px-4 py-2 text-xs font-semibold disabled:opacity-40">Siguiente</button>
                </div>
              </nav>
            )}
          </>
        )}

        {activeCourseId && (
          <section className="glass-panel rounded-2xl p-5 sm:p-6">
            {detailLoading || !selectedDetail ? (
              <p className="text-sm">Cargando detalle del curso seleccionado…</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div>
                  <h2 className="text-lg font-bold">Detalle: {selectedDetail.course.title}</h2>
                  <p className="mt-2 text-sm">{selectedDetail.course.description}</p>
                  <h3 className="mt-5 text-sm font-bold">Prerrequisitos</h3>
                  <div className="mt-2 rounded-xl bg-stone-50 p-3">
                    {selectedDetail.units.some((unit) => unit.lessons.some((lesson) => lesson.prerequisites.length > 0)) ? (
                      <ul className="space-y-2 text-xs">
                        {selectedDetail.units.flatMap((unit) => unit.lessons).flatMap((lesson) =>
                          lesson.prerequisites.map((prerequisite) => (
                            <li key={lesson.id + prerequisite.prerequisiteLessonId}>
                              {lesson.title}: requiere estado {prerequisite.requiredState === 'mastered' ? 'consolidado' : 'completado'} en una lección previa
                            </li>
                          )),
                        )}
                      </ul>
                    ) : <p className="text-xs">Este curso no declara prerrequisitos.</p>}
                  </div>
                  <Link href={'/courses/' + encodeURIComponent(selectedDetail.course.courseVersionId)} className="btn-primary mt-4 w-full">
                    {selectedDetail.course.enrolled ? 'Continuar curso' : 'Ver y matricularme'}
                  </Link>
                </div>
                <div>
                  <h3 className="text-sm font-bold">Unidades</h3>
                  <div className="mt-3 space-y-3">
                    {selectedDetail.units.map((unit) => {
                      const unitLessons = unit.lessons
                      const completed = unitLessons.filter((lesson) => lesson.progress?.state === 'completed' || lesson.progress?.state === 'mastered').length
                      const progress = unitLessons.length ? Math.round((completed / unitLessons.length) * 100) : 0
                      return (
                        <div key={unit.id} className="flex gap-3">
                          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">{unit.position}</span>
                          <div className="min-w-0 flex-1">
                            <strong className="block text-sm">Unidad {unit.position} · {unit.title}</strong>
                            <span className="text-[11px]">{unit.lessons.length} lecciones</span>
                            {selectedDetail.course.enrolled && (
                              <div className="mt-2 h-1.5 rounded-full bg-stone-100">
                                <div className="h-1.5 rounded-full bg-emerald-700" style={{ width: progress + '%' }} />
                              </div>
                            )}
                            {unit.lessons.some((lesson) => lesson.progress?.state === 'locked') && <span className="mt-1 block text-[10px] font-semibold text-blue-700">Algunas lecciones requieren prerrequisitos</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Historial de cursos y matrículas</h2>
          <div className="mt-4 space-y-3">
            {(enrolledData?.items ?? []).map((course) => (
              <div key={course.courseVersionId} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-800">{levelLabel(course.cefrLevel)}</span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm">{course.title}</strong>
                  <span className="text-xs">Matrícula registrada · Versión {course.versionNumber}</span>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-800">Activo</span>
              </div>
            ))}
            {!enrolledData?.items.length && <p className="rounded-xl bg-stone-50 p-4 text-xs">Aún no tienes cursos matriculados.</p>}
          </div>
        </section>
      </main>
    </div>
  )
}
