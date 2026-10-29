'use client'

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'

interface DrillExercise {
  title: string
  englishText: string
  spanishPhonetic: string
  targetSkill: string
}

function DrillContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resultId = searchParams.get('id') || 'drill-1'
  const [exercises, setExercises] = useState<DrillExercise[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<'reading' | 'complete'>('reading')
  const [loading, setLoading] = useState(true)
  const [duration, setDuration] = useState(20 * 60)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      container.useCases.getWeaknessDrill.execute(resultId).then((drill) => {
        setExercises(drill.steps.map((step) => ({
          title: step.title || `Ejercicio ${step.id}`,
          englishText: step.english ?? '',
          spanishPhonetic: step.spanishPhonetics ?? '',
          targetSkill: step.metric || 'Pronunciación',
        })))
        setLoading(false)
      }).catch(() => {
        setExercises([
          { title: 'Ejercicio 1: Arquitectura Distribuida', englishText: 'We refactored the monolith into microservices to improve scalability.', spanishPhonetic: 'Güi rifáktord da mónolith íntu máikroservises tu imprúv skéilabiliti.', targetSkill: 'Pronunciación' },
          { title: 'Ejercicio 2: Standup Meeting', englishText: 'I finished implementing the authentication feature yesterday and pushed to staging.', spanishPhonetic: 'Ai fínisht impliménting di otentikéishon fíchur yésterdei and pusht tu stéiying.', targetSkill: 'Fluidez' },
          { title: 'Ejercicio 3: Code Review', englishText: 'Could you add unit tests for this edge case before merging the pull request?', spanishPhonetic: 'Kud yu ad yúnit tests for dis edy keis bifór méryng da pul rikuést?', targetSkill: 'Conversación' },
        ])
        setLoading(false)
      })
    })
  }, [resultId, router])

  useEffect(() => {
    if (loading || phase === 'complete') return
    const timer = setInterval(() => setDuration(d => d > 0 ? d - 1 : 0), 1000)
    return () => clearInterval(timer)
  }, [loading, phase])

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const current = exercises[currentIdx]

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-purple-400 font-mono text-sm">
      ⚡ Preparando tu drill personalizado...
    </div>
  )

  if (phase === 'complete') return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center p-6 text-slate-100">
      <div className="glass-panel p-10 rounded-3xl border border-purple-500/30 text-center max-w-md">
        <div className="text-5xl mb-4">⚡</div>
        <h1 className="text-2xl font-black text-white mb-2">¡Drill Completado!</h1>
        <p className="text-slate-400 text-sm mb-6">Practicaste {exercises.length} ejercicios de refuerzo. Tu pronunciación mejorará con la práctica constante.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/interview" className="btn-primary text-center text-sm">Nueva Entrevista</Link>
          <Link href="/dashboard" className="glass-panel p-3 rounded-xl border border-white/10 text-sm text-slate-300 text-center hover:border-white/20 transition-all">Dashboard</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">⚡ Drill de Refuerzo</h1>
            <p className="text-xs text-slate-400">Ejercicio {currentIdx + 1} de {exercises.length}</p>
          </div>
          <div className={`font-mono text-lg font-black ${duration < 300 ? 'text-rose-400' : 'text-purple-400'}`}>
            ⏱ {formatTime(duration)}
          </div>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${(currentIdx / exercises.length) * 100}%` }}
          />
        </div>

        <div className="glass-panel p-8 rounded-3xl border border-purple-500/20 space-y-6">
          <div className="flex items-center gap-2">
            <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-3 py-1 rounded-full border border-purple-500/30">
              🎯 {current?.targetSkill}
            </span>
            <span className="text-xs text-slate-500 font-medium">{current?.title}</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">🇺🇸 Lee en voz alta:</div>
              <p className="text-xl font-bold text-white leading-relaxed">{current?.englishText}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">🔊 Así suena en español:</div>
              <p className="text-lg text-amber-300 font-semibold">{current?.spanishPhonetic}</p>
            </div>
          </div>

          <button
            onClick={() => {
              if (currentIdx + 1 >= exercises.length) {
                setPhase('complete')
              } else {
                setCurrentIdx(i => i + 1)
              }
            }}
            className="btn-primary w-full text-center"
          >
            {currentIdx + 1 >= exercises.length ? 'Finalizar Drill ✓' : 'Siguiente Ejercicio →'}
          </button>
        </div>

        <div className="text-center">
          <Link href="/interview" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Salir del drill
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function InterviewDrillPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-purple-400 font-mono text-sm">
        ⚡ Cargando drill...
      </div>
    }>
      <DrillContent />
    </Suspense>
  )
}
