'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { SrsCard, SrsGrade } from '@/domain/entities/SrsCard'

export default function SrsPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SrsCard[]>([])
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    let active = true
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((user) => {
      if (!user) {
        router.replace('/login')
        return
      }
      return container.useCases.getDueCards.execute(30)
    }).then((list) => {
      if (active && list) setCards(list)
    }).catch(() => undefined).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [router])

  const handleReview = async (grade: SrsGrade) => {
    const card = cards[0]
    if (!card || saving) return
    setSaving(true)
    setReviewError('')
    try {
      await getContainer().useCases.reviewCard.execute(card.id, grade)
      setShowAnswer(false)
      setCards((items) => items.filter((item) => item.id !== card.id))
      window.dispatchEvent(new Event('devfluency:xp-updated'))
    } catch {
      setReviewError('No se pudo guardar el repaso. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Cargando tus repasos…</div>
  }

  const currentCard = cards[0]
  const newCards = cards.filter((card) => card.isNew).length

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Repetición espaciada</h1>
            <p className="mt-1 text-sm">Retén lo aprendido con repasos en el momento justo.</p>
          </div>
          <Link href="/srs/session" className="btn-primary">Iniciar sesión de repaso</Link>
        </header>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Pendientes', value: cards.length },
            { label: 'Nuevas', value: newCards },
            { label: 'Aprendidas', value: '—' },
            { label: 'Retención', value: 'Sin medir' },
          ].map((item) => (
            <article key={item.label} className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="mt-2 text-2xl font-extrabold">{item.value}</p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Sesión de repaso{currentCard ? ' · 1 de ' + cards.length : ''}</h2>
              {currentCard?.isNew && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-800">Nueva</span>}
            </div>

            {currentCard ? (
              <>
                <div className="mt-4 rounded-xl bg-[#f4f1e7] px-5 py-10 text-center">
                  <p className="text-xs text-stone-500">¿Cómo se dice?</p>
                  <h3 className="mt-2 text-2xl font-extrabold">{currentCard.exampleEnglish || currentCard.term}</h3>
                  {currentCard.exampleEnglish && <p className="mt-2 text-xs">Término: {currentCard.term}</p>}
                  {showAnswer ? (
                    <div className="mt-5 border-t border-stone-200 pt-4">
                      <p className="text-lg font-semibold text-emerald-800">{currentCard.examplePhonetics || currentCard.spanishPhonetics}</p>
                      <p className="mt-2 text-sm">{currentCard.exampleTranslation || currentCard.spanishTranslation}</p>
                    </div>
                  ) : (
                    <button onClick={() => setShowAnswer(true)} className="mt-5 rounded-xl border border-emerald-700/20 bg-white px-5 py-2.5 text-xs font-bold text-emerald-800">Mostrar respuesta</button>
                  )}
                </div>
                {reviewError && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{reviewError}</p>}
                {showAnswer && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { grade: 0 as SrsGrade, label: 'Otra vez', interval: '1 min' },
                      { grade: 3 as SrsGrade, label: 'Difícil', interval: currentCard.projectInterval(3) + ' d' },
                      { grade: 4 as SrsGrade, label: 'Bien', interval: currentCard.projectInterval(4) + ' d' },
                      { grade: 5 as SrsGrade, label: 'Fácil', interval: currentCard.projectInterval(5) + ' d' },
                    ]).map((option) => (
                      <button key={option.grade} onClick={() => void handleReview(option.grade)} disabled={saving} className="rounded-xl border border-stone-200 bg-white p-3 text-xs font-bold hover:border-emerald-700/40 disabled:opacity-50">
                        {option.label}<span className="mt-1 block text-[10px] font-normal text-stone-500">{option.interval}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 rounded-xl bg-stone-50 p-8 text-center">
                <h3 className="text-xl font-bold">No tienes tarjetas pendientes</h3>
                <p className="mt-2 text-sm">Las próximas revisiones aparecerán aquí según tu programación.</p>
                <Link href="/learn" className="btn-primary mt-5">Ir a practicar</Link>
              </div>
            )}
          </article>

          <article className="glass-panel rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold">Mazos</h2>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-6">
              <h3 className="text-sm font-bold">Tarjetas vinculadas a tu contenido</h3>
              <p className="mt-2 text-xs">El planificador actual entrega tarjetas pendientes, pero todavía no expone gestión independiente de mazos.</p>
              <p className="mt-3 text-sm font-semibold">{cards.length} tarjetas disponibles en esta consulta</p>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 p-4">
              <span className="text-sm font-semibold">Próxima acción</span>
              <Link href="/learn" className="text-xs font-bold text-emerald-800">Añadir vocabulario desde práctica →</Link>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Estadísticas de retención</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-6">
              <p className="text-sm font-semibold">Aún no hay una serie histórica de retención disponible.</p>
              <p className="mt-1 text-xs">Se mostrará cuando el sistema registre y consolide resultados de recuperación a lo largo del tiempo.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Historial de repasos</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-6">
              <p className="text-sm font-semibold">No hay historial agregado para mostrar en esta pantalla.</p>
              <p className="mt-1 text-xs">Puedes continuar con las tarjetas pendientes de hoy.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
