'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'

interface MetricScore {
  key: string
  label: string
  score: number | null
  weight: number
}

function ResultContent() {
  const searchParams = useSearchParams()
  const rawScore = searchParams.get('score')
  const parsedScore = rawScore === null ? null : Number(rawScore)
  const totalScore = parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null
  const passedParam = searchParams.get('passed')
  const resultId = searchParams.get('id')

  const metrics: MetricScore[] = [
    { key: 'listening', label: 'Listening', score: searchParams.has('listening') ? Number(searchParams.get('listening')) : null, weight: 20 },
    { key: 'pronunciation', label: 'Pronunciación', score: searchParams.has('pronunciation') ? Number(searchParams.get('pronunciation')) : null, weight: 20 },
    { key: 'fluency', label: 'Fluidez', score: searchParams.has('fluency') ? Number(searchParams.get('fluency')) : null, weight: 20 },
    { key: 'vocabulary', label: 'Vocabulario', score: searchParams.has('vocabulary') ? Number(searchParams.get('vocabulary')) : null, weight: 15 },
    { key: 'conversation', label: 'Conversación', score: searchParams.has('conversation') ? Number(searchParams.get('conversation')) : null, weight: 15 },
    { key: 'grammar', label: 'Gramática', score: searchParams.has('grammar') ? Number(searchParams.get('grammar')) : null, weight: 10 },
  ]

  const hasResult = totalScore !== null
  const validMetrics = metrics.filter((metric) => metric.score !== null && Number.isFinite(metric.score))
  const hasVerdict = passedParam === 'true' || passedParam === 'false'
  const passed = passedParam === 'true'

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Resultado de práctica</h1>
          <p className="mt-1 text-sm">Revisa el feedback disponible de tu respuesta.</p>
        </header>

        {!hasResult ? (
          <section className="glass-panel rounded-2xl p-8 text-center">
            <h2 className="text-lg font-bold">No encontramos un resultado completo</h2>
            <p className="mt-2 text-sm">Vuelve a la práctica y evalúa una respuesta para consultar su resultado.</p>
            <Link href="/interview" className="btn-primary mt-5">Volver a la práctica</Link>
          </section>
        ) : (
          <>
            <section className="glass-panel rounded-2xl p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide">Puntuación de esta evaluación</p>
              <p className="mt-3 text-5xl font-extrabold">{totalScore.toFixed(1)}%</p>
              {hasVerdict && <p className="mt-2 text-sm font-semibold">{passed ? 'Resultado aprobado' : 'Resultado por reforzar'}</p>}
              <p className="mt-2 text-xs">Esta es la puntuación devuelta por la evaluación técnica, no un diagnóstico global CEFR.</p>
            </section>

            <section className="glass-panel rounded-2xl p-5">
              <h2 className="text-lg font-bold">Desglose por métrica</h2>
              <div className="mt-4 space-y-4">
                {metrics.map((metric) => (
                  <div key={metric.key}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <strong>{metric.label} <span className="font-normal text-xs">({metric.weight}%)</span></strong>
                      <span className="text-xs">{metric.score === null || !Number.isFinite(metric.score) ? 'Sin dato' : metric.score.toFixed(1) + '%'}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      {metric.score !== null && Number.isFinite(metric.score) && <div className="h-2 rounded-full bg-emerald-700" style={{ width: Math.max(0, Math.min(100, metric.score)) + '%' }} />}
                    </div>
                  </div>
                ))}
              </div>
              {validMetrics.length < metrics.length && <p className="mt-4 text-xs">La fuente no proporcionó todas las métricas; las ausentes se muestran sin puntuación.</p>}
            </section>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          {resultId && <Link href={'/interview/drill?id=' + encodeURIComponent(resultId)} className="btn-primary">Ver ejercicios de refuerzo</Link>}
          <Link href="/interview" className="rounded-xl border border-emerald-700/20 px-4 py-3 text-xs font-bold text-emerald-800">Nueva práctica</Link>
          <Link href="/dashboard" className="rounded-xl border border-stone-200 px-4 py-3 text-xs font-bold">Volver al inicio</Link>
        </div>
      </main>
    </div>
  )
}

export default function InterviewResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Cargando resultado…</div>}>
      <ResultContent />
    </Suspense>
  )
}
