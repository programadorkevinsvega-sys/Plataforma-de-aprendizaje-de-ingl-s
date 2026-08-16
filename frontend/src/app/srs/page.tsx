'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { SrsCard } from '@/domain/entities/SrsCard'
import type { SrsGrade } from '@/domain/entities/SrsCard'

export default function SrsPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SrsCard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      container.useCases.getDueCards.execute(30).then((list) => {
        setCards(list)
        setLoading(false)
      }).catch(() => setLoading(false))
    })
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-cyan-400 font-mono text-sm">
        🧠 Cargando Tarjetas Anki SM-2...
      </div>
    )
  }

  const currentCard = cards[currentIndex]

  const handleReview = async (grade: SrsGrade) => {
    if (!currentCard) return
    const container = getContainer()
    await container.useCases.reviewCard.execute(currentCard.id, grade)
    setShowAnswer(false)
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      setCards([])
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 max-w-4xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-white">Repetición Espaciada (Anki SM-2)</h1>
              <p className="text-xs text-slate-400">Repasa justo antes de olvidar — {cards.length} tarjetas pendientes hoy</p>
            </div>
            <Link
              href="/srs/session"
              className="btn-primary text-xs px-5 py-2.5"
            >
              ⚡ Iniciar Sesión Completa →
            </Link>
          </div>

          {/* Stats rápidas */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Pendientes hoy', value: cards.length, color: 'text-cyan-400', emoji: '📋' },
              { label: 'Tarjeta actual', value: cards.length > 0 ? `${currentIndex + 1}/${cards.length}` : '0/0', color: 'text-purple-400', emoji: '🎯' },
              { label: 'Nuevas', value: cards.filter(c => c.isNew).length, color: 'text-emerald-400', emoji: '✨' },
            ].map((s) => (
              <div key={s.label} className="glass-panel p-4 rounded-2xl border border-white/10 text-center">
                <div className="text-lg">{s.emoji}</div>
                <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>

          {!currentCard || cards.length === 0 ? (
            <div className="glass-panel p-12 text-center rounded-3xl border border-emerald-500/30 space-y-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-2xl font-extrabold text-emerald-400">¡Todas las tarjetas repasadas por hoy!</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                El algoritmo SM-2 ha programado tu próxima revisión según tu curva del olvido.
              </p>
              <Link href="/dashboard" className="btn-primary inline-block">← Volver al Dashboard</Link>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-8 border border-white/10 text-center space-y-6">
              <div className="flex items-center justify-center gap-3">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Tarjeta SM-2 · Factor EF: {currentCard.easeFactor.toFixed(2)}
                </div>
                {currentCard.isNew && (
                  <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                    ✨ Nueva
                  </span>
                )}
              </div>

              <div className="py-8 bg-slate-950/80 rounded-2xl border border-slate-800 px-6">
                {/* Ejemplo o término */}
                <h3 className="text-2xl font-black text-white mb-1 leading-relaxed">
                  {currentCard.exampleEnglish || currentCard.term}
                </h3>
                {currentCard.exampleEnglish && (
                  <p className="text-xs text-slate-500 mb-4">Término: <span className="text-slate-300 font-bold">{currentCard.term}</span></p>
                )}

                {showAnswer ? (
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <p className="text-xl font-extrabold text-amber-300 font-mono">
                      🔊 {currentCard.examplePhonetics || currentCard.spanishPhonetics}
                    </p>
                    <p className="text-base text-emerald-400 font-semibold">
                      🇪🇸 {currentCard.exampleTranslation || currentCard.spanishTranslation}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="mt-4 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl transition-all border border-cyan-500/30"
                  >
                    👁️ Revelar Fonética y Traducción
                  </button>
                )}
              </div>

              {/* SM-2 Rating Buttons */}
              {showAnswer && (
                <div className="grid grid-cols-4 gap-3 pt-4 border-t border-white/10">
                  {([
                    { grade: 0 as SrsGrade, label: 'Otra vez', sub: `→ 1d`, color: 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300' },
                    { grade: 3 as SrsGrade, label: 'Difícil', sub: `→ ${currentCard.projectInterval(3)}d`, color: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300' },
                    { grade: 4 as SrsGrade, label: 'Bueno', sub: `→ ${currentCard.projectInterval(4)}d`, color: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300' },
                    { grade: 5 as SrsGrade, label: 'Fácil', sub: `→ ${currentCard.projectInterval(5)}d`, color: 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/40 text-cyan-300' },
                  ] as const).map(({ grade, label, sub, color }) => (
                    <button
                      key={grade}
                      onClick={() => handleReview(grade)}
                      className={`p-3 border rounded-xl font-bold text-xs transition-all ${color}`}
                    >
                      {label}
                      <span className="block text-[10px] opacity-70 font-normal mt-0.5">{sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
