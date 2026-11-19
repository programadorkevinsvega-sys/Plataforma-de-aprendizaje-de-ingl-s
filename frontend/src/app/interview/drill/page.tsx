'use client'

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'

interface DrillExercise {
  id: string
  title: string
  instruction: string
  englishText: string
  spanishPhonetic: string
  spanishTranslation: string
  targetSkill: string
}

function DrillContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resultId = searchParams.get('id')
  const [exercises, setExercises] = useState<DrillExercise[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<'reading' | 'complete'>('reading')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(20 * 60)

  useEffect(() => {
    let active = true
    const load = async () => {
      const container = getContainer()
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      if (!resultId) {
        setError('No se encontró el identificador del resultado que originó este drill.')
        return
      }
      const drill = await container.useCases.getWeaknessDrill.execute(resultId)
      const steps = drill.steps.map((step) => ({
        id: step.id,
        title: step.title,
        instruction: step.instruction,
        englishText: step.english ?? '',
        spanishPhonetic: step.spanishPhonetics ?? '',
        spanishTranslation: step.spanishTranslation ?? '',
        targetSkill: step.metric,
      }))
      if (!steps.length) {
        setError('No hay ejercicios de refuerzo disponibles para este resultado.')
        return
      }
      if (active) {
        setExercises(steps)
        setDuration(drill.totalMinutes * 60)
      }
    }
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el drill.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [resultId, router])

  useEffect(() => {
    if (loading || error || phase === 'complete' || duration <= 0) return
    const timer = window.setInterval(() => setDuration((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [duration, error, loading, phase])

  const formatTime = (seconds: number) =>
    Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0')
  const current = exercises[currentIdx]
  const progress = exercises.length ? (currentIdx / exercises.length) * 100 : 0

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1 items-center justify-center text-sm">Preparando tus ejercicios de refuerzo…</div>
    </div>
  )

  if (error || exercises.length === 0) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center p-6">
        <section className="glass-panel max-w-lg rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold">No hay un drill disponible</h1>
          <p className="mt-2 text-sm">{error || 'No se encontraron pasos de refuerzo para este resultado.'}</p>
          <Link href="/interview" className="btn-primary mt-5">Volver a la práctica</Link>
        </section>
      </main>
    </div>
  )

  if (phase === 'complete') return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center p-6">
        <section className="glass-panel max-w-md rounded-2xl p-8 text-center">
          <div className="text-4xl">✓</div>
          <h1 className="mt-3 text-2xl font-bold">Drill completado</h1>
          <p className="mt-2 text-sm">Revisaste {exercises.length} ejercicios de refuerzo.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Link href="/interview" className="btn-primary">Nueva práctica</Link>
            <Link href="/dashboard" className="rounded-xl border border-stone-200 p-3 text-xs font-bold">Volver al inicio</Link>
          </div>
        </section>
      </main>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-2xl space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold">Drill de refuerzo</h1>
              <p className="text-xs">Ejercicio {currentIdx + 1} de {exercises.length}</p>
            </div>
            <div className="font-mono text-lg font-bold">{formatTime(duration)}</div>
          </div>

          <div className="h-2 rounded-full bg-stone-200">
            <div className="h-2 rounded-full bg-emerald-700 transition-all" style={{ width: progress + '%' }} />
          </div>

          <section className="glass-panel space-y-5 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{current.targetSkill}</span>
              <span className="text-xs">{current.title}</span>
            </div>
            {current.instruction && <p className="text-sm">{current.instruction}</p>}
            {current.englishText && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">Texto en inglés</p>
                <p className="mt-2 text-xl font-bold leading-relaxed">{current.englishText}</p>
              </div>
            )}
            {current.spanishPhonetic && (
              <div className="rounded-xl bg-[#f4f1e7] p-4">
                <p className="text-xs font-semibold">Guía fonética en español</p>
                <p className="mt-2 text-base font-semibold">{current.spanishPhonetic}</p>
              </div>
            )}
            {current.spanishTranslation && (
              <div>
                <p className="text-xs font-semibold">Traducción</p>
                <p className="mt-1 text-sm">{current.spanishTranslation}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (currentIdx + 1 >= exercises.length) setPhase('complete')
                else setCurrentIdx((index) => index + 1)
              }}
              className="btn-primary w-full"
            >
              {currentIdx + 1 >= exercises.length ? 'Finalizar drill' : 'Siguiente ejercicio →'}
            </button>
          </section>
          <div className="text-center">
            <Link href="/interview" className="text-xs font-semibold text-stone-500">Salir del drill</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function InterviewDrillPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm">Cargando drill…</div>}>
      <DrillContent />
    </Suspense>
  )
}
