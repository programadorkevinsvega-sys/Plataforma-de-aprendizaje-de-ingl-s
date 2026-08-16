'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'
import type { SrsCard } from '@/domain/entities/SrsCard'
import type { SrsGrade } from '@/domain/entities/SrsCard'

type CardPhase = 'question' | 'answer' | 'completed'

export default function SrsSessionPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SrsCard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<CardPhase>('question')
  const [loading, setLoading] = useState(true)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, perfect: 0, again: 0 })

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      container.useCases.getDueCards.execute(30).then((cards) => {
        setCards(cards)
        setLoading(false)
      }).catch(() => setLoading(false))
    })
  }, [router])

  const currentCard = cards[currentIdx]
  const progress = cards.length > 0 ? (currentIdx / cards.length) * 100 : 0

  const handleGrade = async (grade: SrsGrade) => {
    try {
      const container = getContainer()
      await container.useCases.reviewCard.execute(currentCard.id, grade)
    } catch {}

    setSessionStats(prev => ({
      reviewed: prev.reviewed + 1,
      perfect: grade >= 4 ? prev.perfect + 1 : prev.perfect,
      again: grade === 0 ? prev.again + 1 : prev.again,
    }))

    if (currentIdx + 1 >= cards.length) {
      setPhase('completed')
    } else {
      setCurrentIdx(i => i + 1)
      setPhase('question')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-emerald-400 font-mono text-sm">
      🧠 Cargando tus tarjetas SM-2...
    </div>
  )

  if (cards.length === 0) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center p-6 text-slate-100">
      <div className="glass-panel p-10 rounded-3xl border border-white/10 text-center max-w-md">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-black text-white mb-2">¡Todo al día!</h1>
        <p className="text-slate-400 text-sm mb-6">
          No tienes tarjetas pendientes de revisión. Tu cerebro está en óptimas condiciones.
        </p>
        <Link href="/srs" className="btn-primary">← Volver al Panel SRS</Link>
      </div>
    </div>
  )

  if (phase === 'completed') return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center p-6 text-slate-100">
      <div className="glass-panel p-10 rounded-3xl border border-emerald-500/30 text-center max-w-md">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-white mb-2">Sesión Completada</h1>
        <div className="grid grid-cols-3 gap-4 my-6">
          <div className="bg-emerald-500/10 p-3 rounded-xl">
            <div className="text-xl font-black text-emerald-400">{sessionStats.reviewed}</div>
            <div className="text-[10px] text-slate-400">Revisadas</div>
          </div>
          <div className="bg-cyan-500/10 p-3 rounded-xl">
            <div className="text-xl font-black text-cyan-400">{sessionStats.perfect}</div>
            <div className="text-[10px] text-slate-400">Perfectas</div>
          </div>
          <div className="bg-rose-500/10 p-3 rounded-xl">
            <div className="text-xl font-black text-rose-400">{sessionStats.again}</div>
            <div className="text-[10px] text-slate-400">A Repetir</div>
          </div>
        </div>
        <Link href="/dashboard" className="btn-primary">Ir al Dashboard →</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Tarjeta {currentIdx + 1} de {cards.length}</span>
          <span>{Math.round(progress)}% completado</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Card */}
        <div className="glass-panel p-8 rounded-3xl border border-white/10 text-center space-y-6 min-h-[320px] flex flex-col justify-between">
          <div className="space-y-4">
            {/* New badge */}
            {currentCard?.isNew && (
              <span className="inline-block bg-cyan-500/20 text-cyan-300 text-[10px] font-bold px-3 py-1 rounded-full border border-cyan-500/30">
                ✨ Nueva tarjeta
              </span>
            )}

            <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">🇺🇸 Inglés</div>

            {/* Show example sentence if available, otherwise term */}
            <p className="text-2xl font-black text-white leading-relaxed">
              {currentCard?.exampleEnglish || currentCard?.term}
            </p>

            {phase === 'answer' && (
              <div className="space-y-3 pt-4 border-t border-white/10 animate-pulse-once">
                {currentCard?.term && currentCard?.exampleEnglish && (
                  <div>
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">📖 Término</div>
                    <p className="text-lg font-bold text-cyan-300">{currentCard.term}</p>
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">🔊 Pronunciación</div>
                  <p className="text-lg text-amber-300 font-semibold">
                    {currentCard?.examplePhonetics || currentCard?.spanishPhonetics}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">🇪🇸 Traducción</div>
                  <p className="text-base text-slate-300">
                    {currentCard?.exampleTranslation || currentCard?.spanishTranslation}
                  </p>
                </div>
                <div className="text-[10px] text-slate-500">
                  Intervalo actual: {currentCard?.intervalDays} día(s) · Factor: {currentCard?.easeFactor?.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {phase === 'question' && (
            <button onClick={() => setPhase('answer')} className="btn-primary mx-auto px-8">
              Ver Respuesta 👀
            </button>
          )}

          {phase === 'answer' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-medium">¿Qué tan fácil fue recordar?</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { grade: 0 as SrsGrade, label: 'Otra vez', color: 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30' },
                  { grade: 3 as SrsGrade, label: 'Difícil', color: 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30' },
                  { grade: 4 as SrsGrade, label: 'Bien', color: 'bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30' },
                  { grade: 5 as SrsGrade, label: 'Perfecto', color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30' },
                ].map(({ grade, label, color }) => (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    className={`py-3 px-2 rounded-xl border text-xs font-bold transition-all ${color}`}
                  >
                    {label}
                    <div className="text-[9px] opacity-60 mt-0.5">
                      ~{currentCard?.projectInterval(grade)}d
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link href="/srs" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Salir de la sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
