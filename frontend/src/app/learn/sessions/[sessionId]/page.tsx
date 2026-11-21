'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { ActivityExerciseRenderer } from '@/presentation/components/activities/ActivityExerciseRenderer'
import type { ActivityAttemptResult, ActivitySubmission } from '@/domain/entities/Activity'
import type { LearningSession, SubmitLearningActivityResult } from '@/domain/repositories/ILearningSessionRepository'
import { getContainer } from '@/infrastructure/di/container'

export default function LearningSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const router = useRouter()
  const sessionId = params.sessionId

  const [session, setSession] = useState<LearningSession | null>(null)
  const [pendingTransition, setPendingTransition] = useState<SubmitLearningActivityResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rewardPending, setRewardPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadSession = useCallback(async () => {
    setRefreshing(true)
    setLoadError(null)
    try {
      const container = getContainer()
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      const current = await container.useCases.getLearningSession.execute(sessionId)
      setSession(current)
      setPendingTransition(null)
      setRewardPending(current.rewardPending)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'No se pudo recuperar la sesión.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router, sessionId])

  useEffect(() => {
    // Defer the initial network load until after the current render commits.
    void Promise.resolve().then(loadSession)
  }, [loadSession])

  const activity = session?.activity ?? null

  const handleSubmit = useCallback(async (submission: ActivitySubmission): Promise<ActivityAttemptResult> => {
    if (!session || !activity) throw new Error('No hay una actividad activa para enviar.')
    const container = getContainer()
    const result = await container.useCases.submitLearningActivity.execute(
      session.sessionId,
      activity,
      submission,
    )
    setPendingTransition(result)
    setRewardPending(result.rewardPending)
    return result.result
  }, [activity, session])

  const continueAfterResult = useCallback(() => {
    if (!pendingTransition) return
    setSession(pendingTransition.session)
    setRewardPending(pendingTransition.rewardPending)
    setPendingTransition(null)
  }, [pendingTransition])

  const nextActionLabel = useMemo(() => {
    if (!pendingTransition) return 'Continuar'
    const sameActivity = pendingTransition.session.status === 'in_progress'
      && session?.currentActivityPosition === pendingTransition.session.currentActivityPosition
    if (pendingTransition.session.status === 'completed') return 'Ver finalización'
    if (pendingTransition.session.status === 'pending_review') return 'Finalizar por ahora'
    return sameActivity ? 'Reintentar actividad' : 'Siguiente actividad'
  }, [pendingTransition, session])

  const elapsedLabel = useMemo(() => {
    const milliseconds = session?.activeDurationMs ?? 0
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return minutes > 0 ? String(minutes) + ' min ' + String(remainder) + ' s' : String(remainder) + ' s'
  }, [session?.activeDurationMs])

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100">
      <Navbar />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar />
        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-9">
          <Link href="/courses" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-emerald-200">
            <span aria-hidden="true">←</span> Volver a cursos
          </Link>

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-center text-sm text-emerald-200" role="status">
              Recuperando tu sesión de aprendizaje…
            </div>
          )}

          {!loading && loadError && (
            <section className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-6" role="alert">
              <h1 className="text-lg font-extrabold text-rose-100">No pudimos recuperar la lección</h1>
              <p className="mt-2 text-sm leading-6 text-rose-100/70">{loadError}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void loadSession()}
                  disabled={refreshing}
                  className="rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-50"
                >
                  {refreshing ? 'Reintentando…' : 'Reintentar recuperación'}
                </button>
                <Link href="/courses" className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-slate-200">
                  Ir a cursos
                </Link>
              </div>
            </section>
          )}

          {!loading && !loadError && session && (
            <>
              <header className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    Sesión de aprendizaje
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[10px] font-bold text-slate-300">
                    {session.status === 'in_progress'
                      ? 'En progreso'
                      : session.status === 'completed'
                        ? 'Completada'
                        : session.status === 'pending_review'
                          ? 'Pendiente de revisión'
                          : 'Abandonada'}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">{session.lessonTitle}</h1>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Actividad</p>
                    <p className="mt-1 text-lg font-extrabold text-white tabular-nums">
                      {Math.min(session.currentActivityPosition, session.totalActivities)} / {session.totalActivities}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tiempo activo</p>
                    <p className="mt-1 text-lg font-extrabold text-white tabular-nums">{elapsedLabel}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Intentos restantes</p>
                    <p className="mt-1 text-lg font-extrabold text-white tabular-nums">
                      {session.remainingAttempts}
                    </p>
                  </div>
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: String(Math.min(100, Math.max(0, ((session.currentActivityPosition - 1) / session.totalActivities) * 100))) + '%' }}
                  />
                </div>
              </header>

              {rewardPending && (
                <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100" role="status">
                  La lección está completada. La acreditación de la recompensa quedó pendiente por una incidencia temporal y se reintentará al recuperar esta sesión.
                </p>
              )}

              {session.status === 'in_progress' && activity && (
                <ActivityExerciseRenderer
                  key={activity.activityId + ':' + activity.activityVersion + ':' + session.remainingAttempts}
                  activity={activity}
                  onSubmit={handleSubmit}
                  onContinue={pendingTransition ? continueAfterResult : undefined}
                  continueLabel={nextActionLabel}
                />
              )}

              {session.status === 'completed' && (
                <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-7 text-center">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Lección completada</div>
                  <h2 className="mt-3 text-2xl font-black text-white">Buen trabajo. Has terminado esta lección.</h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    Tus respuestas y el avance académico quedaron registrados en el servidor.
                  </p>
                  <Link href="/courses" className="mt-6 inline-flex rounded-xl bg-emerald-400 px-5 py-3 text-xs font-extrabold text-slate-950 hover:bg-emerald-300">
                    Volver al curso
                  </Link>
                </section>
              )}

              {session.status === 'pending_review' && (
                <section className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-7">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Revisión pendiente</div>
                  <h2 className="mt-3 text-xl font-black text-white">Tu respuesta requiere revisión.</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    La sesión se ha guardado. No se ha inventado una puntuación para esta respuesta y la evaluación acústica no se infiere a partir de una transcripción.
                  </p>
                  <Link href="/courses" className="mt-6 inline-flex rounded-xl border border-white/15 px-5 py-3 text-xs font-bold text-slate-100 hover:border-emerald-300/40">
                    Volver al curso
                  </Link>
                </section>
              )}

              {session.status === 'abandoned' && (
                <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-7">
                  <h2 className="text-xl font-extrabold text-white">Esta sesión fue cerrada.</h2>
                  <p className="mt-2 text-sm text-slate-400">Tus resultados confirmados se conservan en el historial.</p>
                  <Link href="/courses" className="mt-6 inline-flex rounded-xl border border-white/15 px-5 py-3 text-xs font-bold text-slate-100">
                    Volver al curso
                  </Link>
                </section>
              )}

              {session.status === 'in_progress' && !activity && (
                <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-100" role="alert">
                  La sesión activa no contiene una actividad válida. No se modificó tu progreso; vuelve a cargar la sesión o contacta al soporte.
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
