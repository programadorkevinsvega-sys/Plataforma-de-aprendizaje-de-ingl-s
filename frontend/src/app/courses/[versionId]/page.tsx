'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { CurriculumCourseDetail } from '@/domain/repositories/ICurriculumRepository'

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function progressLabel(state: string): string {
  const labels: Record<string, string> = {
    not_enrolled: 'Matricúlate para desbloquear',
    locked: 'Bloqueada · requisitos pendientes',
    available: 'Desbloqueada · disponible',
    in_progress: 'En progreso',
    completed: 'Completada',
    mastered: 'Consolidada · repaso SM-2',
  }
  return labels[state] ?? 'Progreso no disponible'
}

function progressTone(state: string): string {
  const tones: Record<string, string> = {
    not_enrolled: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
    locked: 'border-amber-400/20 bg-amber-400/5 text-amber-200',
    available: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    in_progress: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    mastered: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  }
  return tones[state] ?? tones.locked
}

function skillLabel(skill: string): string {
  const labels: Record<string, string> = {
    vocabulary: 'Vocabulario',
    grammar: 'Gramática',
    listening: 'Comprensión auditiva',
    reading: 'Lectura',
    writing: 'Escritura',
    speaking: 'Expresión oral',
    interaction: 'Interacción',
    mediation: 'Mediación',
    phonology: 'Fonología',
  }
  return labels[skill] ?? skill
}

export default function CurriculumCoursePage() {
  const params = useParams<{ versionId: string }>()
  const router = useRouter()
  const courseVersionId = params.versionId

  const [detail, setDetail] = useState<CurriculumCourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrollmentMessage, setEnrollmentMessage] = useState<string | null>(null)
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const container = getContainer()
        const user = await container.useCases.getCurrentUser.execute()
        if (!user) {
          router.replace('/login')
          return
        }
        const result = await container.useCases.getCurriculumCourse.execute(courseVersionId)
        if (!cancelled) setDetail(result)
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'No se pudo cargar el detalle del curso.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [courseVersionId, router])

  const lessonTitles = useMemo(() => {
    const titles = new Map<string, string>()
    detail?.units.forEach((unit) =>
      unit.lessons.forEach((lesson) => titles.set(lesson.id, lesson.title)),
    )
    return titles
  }, [detail])

  const handleEnroll = async () => {
    if (!detail || enrolling || detail.course.enrolled) return
    setEnrolling(true)
    setEnrollmentMessage(null)
    setEnrollmentError(null)
    try {
      const container = getContainer()
      await container.useCases.enrollInCurriculumCourse.execute(
        detail.course.courseVersionId,
      )
      setDetail((current) =>
        current
          ? { ...current, course: { ...current.course, enrolled: true } }
          : current,
      )
      setEnrollmentMessage('Tu matrícula quedó registrada correctamente.')
    } catch (cause) {
      setEnrollmentError(
        cause instanceof Error ? cause.message : 'No se pudo registrar la matrícula.',
      )
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 p-5 sm:p-8 max-w-7xl space-y-7">
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition-colors hover:text-emerald-200"
          >
            <span aria-hidden="true">←</span>
            Volver al catálogo
          </Link>

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-center text-sm text-emerald-300" aria-live="polite">
              Cargando estructura académica…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6" role="alert">
              <h1 className="font-bold text-rose-200">No pudimos abrir este curso</h1>
              <p className="mt-2 text-sm leading-6 text-rose-100/70">{error}</p>
              <Link href="/courses" className="mt-4 inline-block text-xs font-bold text-emerald-200 hover:text-emerald-100">
                Regresar al catálogo
              </Link>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              <header className="glass-panel relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8">
                <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                      {detail.course.trackCode === 'technology' ? 'Inglés tecnológico' : 'Inglés general'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-white">
                      {levelLabel(detail.course.cefrLevel)}
                    </span>
                    <span className="text-xs text-slate-500">
                      Versión {detail.course.versionNumber}
                      {detail.course.status === 'archived' && ' · Archivada'}
                    </span>
                  </div>
                  <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {detail.course.title}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                    {detail.course.description || 'Recorrido académico organizado por unidades, lecciones y objetivos verificables.'}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-2 text-xs text-slate-300">
                      <strong className="text-white">{detail.course.unitCount}</strong> unidades
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-2 text-xs text-slate-300">
                      <strong className="text-white">{detail.course.lessonCount}</strong> lecciones
                    </div>
                    {detail.course.estimatedMinutes > 0 && (
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-2 text-xs text-slate-300">
                        <strong className="text-white">{detail.course.estimatedMinutes}</strong> minutos estimados
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleEnroll()}
                      disabled={enrolling || detail.course.enrolled}
                      className="rounded-xl bg-emerald-400 px-5 py-3 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/20 disabled:text-emerald-200"
                    >
                      {enrolling
                        ? 'Registrando matrícula…'
                        : detail.course.enrolled
                          ? '✓ Ya estás matriculado'
                          : 'Matricularme en este curso'}
                    </button>
                  </div>
                  {enrollmentMessage && (
                    <p className="mt-3 text-xs font-semibold text-emerald-300" role="status">
                      {enrollmentMessage}
                    </p>
                  )}
                  {enrollmentError && (
                    <p className="mt-3 text-xs font-semibold text-rose-300" role="alert">
                      {enrollmentError}
                    </p>
                  )}
                </div>
              </header>

              <nav className="flex flex-wrap gap-3" aria-label="Herramientas de aprendizaje">
                <Link href="/learn" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs font-bold text-emerald-100 hover:bg-emerald-400/15">
                  Practicar vocabulario y pronunciación →
                </Link>
                <Link href="/comprehension" className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-xs font-bold text-slate-200 hover:border-emerald-400/30">
                  Abrir Reading y Listening →
                </Link>
              </nav>

              <section className="space-y-4" aria-label="Estructura del curso">
                <div>
                  <h2 className="text-xl font-extrabold text-white">Contenido del curso</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Unidades, lecciones, objetivos y criterios de éxito publicados.
                  </p>
                </div>

                {detail.units.map((unit) => (
                  <article
                    key={unit.id}
                    id={`unit-${unit.id}`}
                    className="glass-panel rounded-3xl border border-white/10 p-5 sm:p-7"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                          Unidad {unit.position} {unit.theme ? `· ${unit.theme}` : ''}
                        </div>
                        <h3 className="mt-2 text-lg font-extrabold text-white">{unit.title}</h3>
                        {unit.description && (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{unit.description}</p>
                        )}
                      </div>
                      {unit.estimatedMinutes > 0 && (
                        <span className="shrink-0 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-400">
                          ~{unit.estimatedMinutes} min
                        </span>
                      )}
                    </div>

                    <div className="mt-6 space-y-4">
                      {unit.lessons.map((lesson) => (
                        <section
                          key={lesson.id}
                          id={`lesson-${lesson.id}`}
                          className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                              Lección {lesson.position} · {lesson.lessonPattern}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {lesson.estimatedMinutes > 0 && (
                                <span className="text-[10px] text-slate-500">
                                  ~{lesson.estimatedMinutes} min
                                </span>
                              )}
                              {lesson.progress && (
                                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${progressTone(lesson.progress.state)}`}>
                                  {progressLabel(lesson.progress.state)}
                                </span>
                              )}
                            </div>
                          </div>
                          <h4 className="mt-2 text-base font-bold text-white">{lesson.title}</h4>
                          {lesson.progress && detail.course.enrolled && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                <span className="font-semibold text-slate-300">
                                  Objetivos requeridos: {lesson.progress.completedObjectives}/{lesson.progress.requiredObjectives}
                                </span>
                                <span className="text-slate-500">
                                  Cobertura de repaso SM-2: {Math.round(lesson.progress.masteryScore * 100)}%
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-emerald-400 transition-all"
                                  style={{ width: `${Math.round(lesson.progress.requiredObjectives > 0 ? (lesson.progress.completedObjectives / lesson.progress.requiredObjectives) * 100 : 0)}%` }}
                                />
                              </div>
                              {lesson.progress.state === 'locked' && (
                                <p className="mt-2 text-[10px] leading-5 text-amber-200/70">
                                  Completa las lecciones previas para desbloquear esta ruta.
                                </p>
                              )}
                              {lesson.progress.state === 'available' && (
                                <p className="mt-2 text-[10px] leading-5 text-emerald-100/70">
                                  Los prerrequisitos están satisfechos. Las actividades interactivas se habilitarán con el motor de ejercicios de Fase 2.
                                </p>
                              )}
                            </div>
                          )}
                          {lesson.description && (
                            <p className="mt-2 text-sm leading-6 text-slate-400">{lesson.description}</p>
                          )}

                          {lesson.prerequisites.length > 0 && (
                            <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                                Requisitos previos
                              </div>
                              <ul className="mt-2 space-y-1 text-xs text-amber-100/70">
                                {lesson.prerequisites.map((prerequisite) => (
                                  <li key={prerequisite.prerequisiteLessonId}>
                                    {lessonTitles.get(prerequisite.prerequisiteLessonId) ??
                                      `Lección ${prerequisite.prerequisiteLessonId.slice(0, 8)}`}
                                    {' · '}
                                    {prerequisite.requiredState === 'mastered'
                                      ? `dominio mínimo ${Math.round(prerequisite.minimumMasteryScore * 100)}%`
                                      : 'completada'}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="mt-4">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Objetivos de aprendizaje
                            </div>
                            {lesson.objectives.length === 0 ? (
                              <p className="mt-2 text-xs text-slate-500">Esta lección no tiene objetivos asociados.</p>
                            ) : (
                              <ol className="mt-3 space-y-3">
                                {lesson.objectives.map((objective) => (
                                  <li key={objective.id} className="border-l-2 border-emerald-400/30 pl-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold text-slate-200">
                                        {objective.description}
                                      </span>
                                      {!objective.required && (
                                        <span className="text-[9px] font-bold uppercase text-slate-500">Opcional</span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      Criterio de éxito: {objective.successCriteria}
                                    </p>
                                    {objective.skills.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {objective.skills.map((skill) => (
                                          <span
                                            key={skill}
                                            className="rounded-md border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-[9px] font-semibold text-emerald-200/80"
                                          >
                                            {skillLabel(skill)}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </section>

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-xs leading-6 text-emerald-100/70">
                El desbloqueo se calcula con evidencia persistida: palabras registradas como
                aprendidas y revisiones SM-2 exitosas de las frases asociadas. El porcentaje
                es una señal de práctica repetida (hasta tres revisiones exitosas por frase),
                no una calificación lingüística. Los objetivos de gramática, escritura y
                expresión oral necesitan intentos evaluados del motor de actividades de Fase 2.
                Una lección desbloqueada aún no implica que sus ejercicios estén disponibles.
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
