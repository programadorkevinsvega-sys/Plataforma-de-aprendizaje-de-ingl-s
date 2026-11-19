'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { VocabularyWord } from '@/domain/entities/VocabularyWord'

const skillTabs = [
  { label: 'Vocabulario', active: true },
  { label: 'Gramática', active: false },
  { label: 'Reading', active: false },
  { label: 'Writing', active: false },
  { label: 'Listening', active: false },
  { label: 'Speaking', active: false },
  { label: 'Diálogos', active: false },
  { label: 'Fonética', active: false },
]

export default function LearnPage() {
  const router = useRouter()
  const [words, setWords] = useState<VocabularyWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState(0)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSavingProgress, setIsSavingProgress] = useState(false)
  const [xpToast, setXpToast] = useState(false)

  useEffect(() => {
    let active = true
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((user) => {
      if (!user) {
        router.replace('/login')
        return
      }
      return container.useCases.getVocabulary.execute()
    }).then((list) => {
      if (active && list) setWords(list)
    }).catch((error) => {
      console.error('Error fetching vocabulary:', error)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [router])

  const normalizePhoneticsForTts = (phonetic: string): string =>
    phonetic.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '').normalize('NFC')

  const handlePlayAudio = async (textToPlay: string, voice: string, rate?: string) => {
    if (!textToPlay || isPlayingAudio) return
    setIsPlayingAudio(true)
    try {
      const speech = await getContainer().useCases.synthesizeSpeech.execute(textToPlay, voice, rate)
      if (speech.audioUrl?.startsWith('data:')) {
        const audio = new Audio(speech.audioUrl)
        audio.playbackRate = speech.playbackRate
        audio.onended = () => setIsPlayingAudio(false)
        audio.onerror = () => setIsPlayingAudio(false)
        await audio.play()
        return
      }
    } catch (error) {
      console.warn('Audio synthesis error:', error)
    }
    setIsPlayingAudio(false)
  }

  const handleNextWord = async () => {
    const currentWord = words[currentIndex]
    if (!currentWord) return
    setIsSavingProgress(true)
    try {
      await getContainer().useCases.recordLearningProgress.execute(currentWord.id)
      window.dispatchEvent(new Event('devfluency:xp-updated'))
      setXpToast(true)
      window.setTimeout(() => setXpToast(false), 1800)
    } catch (error) {
      console.warn('Error saving progress:', error)
    } finally {
      setIsSavingProgress(false)
      setCurrentIndex((index) => (index + 1) % words.length)
      setSelectedSentenceIndex(0)
    }
  }

  const handlePreviousWord = () => {
    setCurrentIndex((index) => (index - 1 + words.length) % words.length)
    setSelectedSentenceIndex(0)
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Preparando tu práctica…</div>
    </div>
  )

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <div className="glass-panel max-w-lg rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-bold">Todavía no hay vocabulario disponible</h1>
            <p className="mt-2 text-sm">Cuando se publique contenido curricular, aparecerá aquí para practicar.</p>
            <Link href="/courses" className="btn-primary mt-5">Explorar cursos</Link>
          </div>
        </main>
      </div>
    )
  }

  const currentWord = words[currentIndex]
  const currentSentence = currentWord.sentences[selectedSentenceIndex] || currentWord.sentences[0]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Centro de práctica</h1>
          <p className="mt-1 text-sm">Elige una competencia y practica con el contenido disponible.</p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Competencias de práctica">
          {skillTabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              disabled={!tab.active}
              aria-pressed={tab.label === 'Vocabulario'}
              className={'rounded-full border px-4 py-2 text-xs font-semibold ' + (tab.label === 'Vocabulario' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-500 disabled:cursor-not-allowed disabled:opacity-70')}
            >
              {tab.label}{!tab.active && <span className="ml-1 text-[10px]">· próximamente</span>}
            </button>
          ))}
        </nav>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-800">Vocabulario · {currentWord.level}</p>
                <h2 className="mt-1 text-xl font-bold">Práctica contextual</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Palabra {currentIndex + 1} de {words.length}</span>
            </div>

            <div className="mt-5 rounded-xl bg-[#f4f1e7] p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{currentWord.category}</p>
              <h3 className="mt-2 text-3xl font-extrabold">{currentWord.term}</h3>
              <p className="mt-2 text-sm font-semibold text-emerald-800">{currentWord.spanishTranslation}</p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {currentWord.sentences.map((_, index) => (
                <button key={index} onClick={() => setSelectedSentenceIndex(index)} className={'rounded-lg border px-3 py-2 text-xs font-semibold ' + (selectedSentenceIndex === index ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-600')}>
                  Frase {index + 1}
                </button>
              ))}
            </div>

            {currentSentence && (
              <div className="mt-4 rounded-xl border border-stone-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-stone-500">Texto original en inglés</span>
                  <button onClick={() => handlePlayAudio(currentSentence.english, 'Matthew')} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">
                    {isPlayingAudio ? 'Reproduciendo…' : '▶ Escuchar inglés'}
                  </button>
                </div>
                <p className="mt-3 text-xl font-semibold leading-relaxed">{currentSentence.english}</p>
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <span className="text-xs font-semibold text-stone-500">Traducción</span>
                  <p className="mt-1 text-sm">{currentSentence.spanishTranslation}</p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-stone-100 pt-4">
              <button onClick={handlePreviousWord} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-700">← Anterior</button>
              <button onClick={() => void handleNextWord()} disabled={isSavingProgress} className="btn-primary">
                {isSavingProgress ? 'Guardando…' : 'Entendido · Guardar progreso →'}
              </button>
            </div>
            {xpToast && <p role="status" className="mt-3 text-center text-sm font-bold text-emerald-800">Progreso guardado.</p>}
          </article>

          <article className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Sistema dual de pronunciación</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-800">Para hispanohablantes</span>
            </div>
            {currentSentence && (
              <>
                <div className="mt-4 rounded-xl bg-[#f4f1e7] p-4">
                  <span className="text-xs font-semibold text-stone-500">Texto original</span>
                  <p className="mt-1 text-lg font-bold">{currentSentence.english}</p>
                </div>
                <div className="mt-3 rounded-xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-stone-500">Guía fonética lenta</span>
                    <button onClick={() => handlePlayAudio(normalizePhoneticsForTts(currentSentence.spanishPhonetics), 'Lupe', 'x-slow')} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">▶ Audio lento</button>
                  </div>
                  <p className="mt-2 text-base font-semibold">{currentSentence.spanishPhonetics}</p>
                </div>
                <div className="mt-3 rounded-xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-stone-500">Guía de pronunciación natural</span>
                    <button onClick={() => handlePlayAudio(normalizePhoneticsForTts(currentSentence.spanishPhoneticsNatural || currentSentence.spanishPhonetics), 'Lupe')} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">▶ Audio natural</button>
                  </div>
                  <p className="mt-2 text-base font-semibold">{currentSentence.spanishPhoneticsNatural || currentSentence.spanishPhonetics}</p>
                </div>
                <p className="mt-4 text-xs">La guía es una aproximación pedagógica y no sustituye la escritura correcta ni una transcripción fonética IPA.</p>
              </>
            )}
          </article>
        </section>
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Corrección y explicación</h2>
          <div className="mt-4 rounded-xl bg-stone-50 p-4">
            <p className="text-sm font-semibold">Esta práctica registra el repaso del vocabulario, no una respuesta evaluada.</p>
            <p className="mt-1 text-xs">La corrección gramatical y la explicación paso a paso aparecerán cuando se conecte el motor de ejercicios interactivos.</p>
          </div>
        </section>
        <div className="text-right text-xs"><Link href="/courses" className="font-semibold text-emerald-800">Volver al catálogo de cursos →</Link></div>
      </main>
    </div>
  )
}
