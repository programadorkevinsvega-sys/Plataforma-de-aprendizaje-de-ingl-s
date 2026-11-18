'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface MetricScore {
  key: string
  label: string
  score: number
  weight: number
  emoji: string
}

function ResultContent() {
  const searchParams = useSearchParams()
  const passed = searchParams.get('passed') === 'true'
  const totalScore = parseFloat(searchParams.get('score') || '0')
  const resultId = searchParams.get('id') || 'result-1'

  const metrics: MetricScore[] = [
    { key: 'listening', label: 'Listening', score: parseFloat(searchParams.get('listening') || '78'), weight: 20, emoji: '👂' },
    { key: 'pronunciation', label: 'Pronunciación', score: parseFloat(searchParams.get('pronunciation') || '85'), weight: 20, emoji: '🗣️' },
    { key: 'fluency', label: 'Fluidez', score: parseFloat(searchParams.get('fluency') || '72'), weight: 20, emoji: '🌊' },
    { key: 'vocabulary', label: 'Vocabulario', score: parseFloat(searchParams.get('vocabulary') || '88'), weight: 15, emoji: '📖' },
    { key: 'grammar', label: 'Gramática', score: parseFloat(searchParams.get('grammar') || '80'), weight: 10, emoji: '✍️' },
    { key: 'conversation', label: 'Conversación', score: parseFloat(searchParams.get('conversation') || '76'), weight: 15, emoji: '💬' },
  ]

  const calculatedTotal = metrics.reduce((acc, m) => acc + (m.score * m.weight / 100), 0)
  const displayTotal = totalScore || parseFloat(calculatedTotal.toFixed(1))
  const displayPassed = passed || displayTotal >= 90

  const weaknesses = metrics
    .filter(m => m.score < 85)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className={`glass-panel p-8 rounded-3xl border text-center relative overflow-hidden ${displayPassed ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
          <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none ${displayPassed ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />
          <div className="relative z-10">
            <div className="text-5xl mb-3">{displayPassed ? '🏆' : '📈'}</div>
            <h1 className="text-3xl font-black text-white mb-1">
              {displayPassed ? '¡Aprobado!' : 'Sigue Mejorando'}
            </h1>
            <div className={`text-5xl font-black mt-4 ${displayPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {displayTotal.toFixed(1)}%
            </div>
            <p className="text-slate-400 text-sm mt-2">
              {displayPassed
                ? 'Superaste el umbral mínimo de 90%'
                : `Necesitas ${(90 - displayTotal).toFixed(1)}% más para superar el 90%`}
            </p>
          </div>
        </div>

        {/* Métricas */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10">
          <h2 className="text-lg font-black text-white mb-5">📊 Desglose por Métrica</h2>
          <div className="space-y-3">
            {metrics.map(m => (
              <div key={m.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    {m.emoji} {m.label}
                    <span className="text-slate-500">({m.weight}%)</span>
                  </span>
                  <span className={`text-xs font-black ${m.score >= 90 ? 'text-emerald-400' : m.score >= 75 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {m.score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-1000 ${m.score >= 90 ? 'bg-emerald-500' : m.score >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${m.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Debilidades */}
        {weaknesses.length > 0 && (
          <div className="glass-panel p-6 rounded-3xl border border-amber-500/20">
            <h2 className="text-lg font-black text-white mb-4">🎯 Áreas de Mejora Detectadas</h2>
            <div className="space-y-3">
              {weaknesses.map((w, i) => (
                <div key={i} className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-amber-300">{w.label}</span>
                    <span className="text-xs font-black text-amber-400">{w.score.toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-slate-400">Reforzar ejercicios de {w.label.toLowerCase()} en contexto conversacional técnico.</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            href={`/interview/drill?id=${resultId}`}
            className="glass-panel p-5 rounded-2xl border border-purple-500/30 hover:border-purple-500/60 transition-all text-center"
          >
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm font-bold text-white">Drill de Refuerzo</div>
            <div className="text-xs text-slate-400 mt-1">20 min de práctica específica</div>
          </Link>
          <Link
            href="/interview"
            className="glass-panel p-5 rounded-2xl border border-cyan-500/30 hover:border-cyan-500/60 transition-all text-center"
          >
            <div className="text-2xl mb-2">🔄</div>
            <div className="text-sm font-bold text-white">Nueva Entrevista</div>
            <div className="text-xs text-slate-400 mt-1">Practica con otra pregunta</div>
          </Link>
        </div>

        <div className="text-center">
          <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function InterviewResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-emerald-400 font-mono text-sm">
        📊 Cargando resultado...
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}
