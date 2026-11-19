'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { SrsCard, SrsGrade } from '@/domain/entities/SrsCard'

type CardPhase = 'question' | 'answer' | 'completed'

export default function SrsSessionPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SrsCard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<CardPhase>('question')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, perfect: 0, again: 0 })

  useEffect(() => {
    let active = true
    const container = getContainer()
    const load = async () => {
      const user = await container.useCases.getCurrentUser.execute()
      if (!user) {
        router.replace('/login')
        return
      }
      const dueCards = await container.useCases.getDueCards.execute(30)
      if (active) setCards(dueCards)
    }
    void load().catch(() => {
      if (active) setError('No se pudieron cargar las tarjetas de repaso.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [router])

  const currentCard = cards[currentIdx]
  const progress = cards.length > 0 ? ((currentIdx + (phase === 'completed' ? 1 : 0)) / cards.length) * 100 : 0

  const handleGrade = async (grade: SrsGrade) => {
    if (!currentCard || saving) return
    setSaving(true)
    setError('')
    try {
      await getContainer().useCases.reviewCard.execute(currentCard.id, grade)
      setSessionStats((previous) => ({
        reviewed: previous.reviewed + 1,
        perfect: grade >= 4 ? previous.perfect + 1 : previous.perfect,
        again: grade === 0 ? previous.again + 1 : previous.again,
      }))
      window.dispatchEvent(new Event('devfluency:xp-updated'))
      if (currentIdx + 1 >= cards.length) {
        setPhase('completed')
      } else {
        setCurrentIdx((index) => index + 1)
        setPhase('question')
      }
    } catch {
      setError('No se pudo guardar la revisión. La tarjeta seguirá pendiente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {loading ? (
        <main className="flex flex-1 items-center justify-center text-sm">Cargando tus tarjetas SM-2…</main>
      ) : error && cards.length === 0 ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <section className="glass-panel max-w-md rounded-2xl p-8 text-center">
            <h1 className="text-xl font-bold">No pudimos cargar la sesión</h1>
            <p className="mt-2 text-sm">{error}</p>
            <Link href="/srs" className="btn-primary mt-5">Volver a Repaso</Link>
          </section>
        </main>
      ) : cards.length === 0 || phase === 'completed' ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <section className="glass-panel max-w-md rounded-2xl p-8 text-center">
            <div className="text-4xl">✓</div>
            <h1 className="mt-3 text-2xl font-bold">{sessionStats.reviewed ? 'Sesión completada' : 'Todo al día'}</h1>
            <p className="mt-2 text-sm">{sessionStats.reviewed ? 'Terminaste las tarjetas programadas para esta sesión.' : 'No tienes tarjetas pendientes de revisión.'}</p>
            {sessionStats.reviewed > 0 && (
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{sessionStats.reviewed}</strong><span className="text-[10px]">Revisadas</span></div>
                <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{sessionStats.perfect}</strong><span className="text-[10px]">Bien o fácil</span></div>
                <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{sessionStats.again}</strong><span className="text-[10px]">Otra vez</span></div>
              </div>
            )}
            <Link href="/srs" className="btn-primary mt-6">Volver a Repaso</Link>
          </section>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full max-w-2xl space-y-5">
            <div className="flex items-center justify-between text-xs">
              <span>Tarjeta {currentIdx + 1} de {cards.length}</span>
              <span>{Math.round(progress)}% completado</span>
            </div>
            <div className="h-2 rounded-full bg-stone-200">
              <div className="h-2 rounded-full bg-emerald-700 transition-all" style={{ width: progress + '%' }} />
            </div>

            <section className="glass-panel flex min-h-[340px] flex-col justify-between rounded-2xl p-6 text-center sm:p-8">
              <div className="space-y-4">
                {currentCard?.isNew && <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-800">Nueva tarjeta</span>}
                <p className="text-xs font-bold uppercase tracking-wide">Inglés</p>
                <h1 className="text-2xl font-extrabold">{currentCard?.exampleEnglish || currentCard?.term}</h1>

                {phase === 'answer' && (
                  <div className="space-y-3 border-t border-stone-100 pt-4 text-left">
                    {currentCard?.term && currentCard?.exampleEnglish && <div><span className="text-xs font-semibold">Término</span><p className="mt-1 text-lg font-bold">{currentCard.term}</p></div>}
                    <div><span className="text-xs font-semibold">Pronunciación</span><p className="mt-1 text-lg font-semibold text-emerald-800">{currentCard?.examplePhonetics || currentCard?.spanishPhonetics}</p></div>
                    <div><span className="text-xs font-semibold">Traducción</span><p className="mt-1 text-sm">{currentCard?.exampleTranslation || currentCard?.spanishTranslation}</p></div>
                    <p className="text-[10px]">Intervalo actual: {currentCard?.intervalDays} día(s) · Factor: {currentCard?.easeFactor?.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {phase === 'question' ? (
                <button onClick={() => setPhase('answer')} className="btn-primary mx-auto mt-6 px-8">Mostrar respuesta</button>
              ) : (
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-medium">¿Qué tan fácil fue recordar?</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { grade: 0 as SrsGrade, label: 'Otra vez' },
                      { grade: 3 as SrsGrade, label: 'Difícil' },
                      { grade: 4 as SrsGrade, label: 'Bien' },
                      { grade: 5 as SrsGrade, label: 'Fácil' },
                    ]).map(({ grade, label }) => (
                      <button key={grade} onClick={() => void handleGrade(grade)} disabled={saving} className="rounded-xl border border-stone-200 bg-white p-3 text-xs font-bold hover:border-emerald-700/40 disabled:opacity-50">
                        {label}
                        <span className="mt-1 block text-[10px] font-normal text-stone-500">~{currentCard?.projectInterval(grade)} d</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
            </section>

            <div className="text-center">
              <Link href="/srs" className="text-xs font-semibold text-stone-500">Salir de la sesión</Link>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}
