'use client'

import React, { useEffect, useState } from 'react'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { VocabularyWord } from '@/domain/entities/VocabularyWord'

export default function LearnPage() {
  const [words, setWords] = useState<VocabularyWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState(0)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSavingProgress, setIsSavingProgress] = useState(false)
  const [xpToast, setXpToast] = useState(false)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getVocabulary.execute()
      .then((list) => {
        setWords(list)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching vocabulary:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-cyan-400 font-mono text-sm">
        📚 Cargando Lecciones Conversacionales...
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex flex-col items-center justify-center text-slate-300 gap-4">
        <div className="text-4xl">🎉</div>
        <div className="text-xl font-bold">¡Felicidades! Has completado todas las palabras</div>
        <p className="text-sm text-slate-500">Has añadido todo el vocabulario disponible a tu mazo de Repetición Espaciada (SRS).</p>
      </div>
    )
  }

  const currentWord = words[currentIndex]
  const currentSentence = currentWord.sentences[selectedSentenceIndex] || currentWord.sentences[0]

  /**
   * Normaliza el texto fonético antes de enviarlo a AWS Polly (voz Lupe).
   * Elimina tildes de acentuación (que solo marcan énfasis visual) y guiones
   * silábicos para que Lupe lea exactamente lo que el hispanohablante ve.
   * Ejemplo: "ái ran é-vri déi." → "ai ran evri dei."
   */
  const normalizePhoneticsForTts = (phonetic: string): string =>
    phonetic
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // elimina diacríticos / tildes
      .replace(/-/g, '')                 // elimina guiones silábicos
      .normalize('NFC')

  const handlePlayAudio = async (textToPlay: string, voice: string, rate?: string) => {
    if (!textToPlay || isPlayingAudio) return
    setIsPlayingAudio(true)
    try {
      const container = getContainer()
      const audioDataUrl = await container.useCases.synthesizeSpeech.execute(textToPlay, voice, rate)
      if (audioDataUrl && audioDataUrl.startsWith('data:')) {
        const audio = new Audio(audioDataUrl)
        audio.onended = () => setIsPlayingAudio(false)
        audio.onerror = () => setIsPlayingAudio(false)
        await audio.play()
        return
      }
    } catch (err) {
      console.warn('Audio synthesis error:', err)
    }
    setIsPlayingAudio(false)
  }

  const handleNextWord = async () => {
    if (!currentWord) return
    
    // Save progress to backend
    setIsSavingProgress(true)
    try {
      const container = getContainer()
      await container.useCases.recordLearningProgress.execute(currentWord.id)

      // Notificar al Navbar para que refresque XP, racha y monedas
      window.dispatchEvent(new Event('devfluency:xp-updated'))
      setXpToast(true)
      setTimeout(() => setXpToast(false), 2000)
    } catch (err) {
      console.warn('Error saving progress:', err)
    } finally {
      setIsSavingProgress(false)
      setCurrentIndex((prev) => (prev + 1) % words.length)
      setSelectedSentenceIndex(0)
    }

  }

  const handlePrevWord = () => {
    setCurrentIndex((prev) => (prev - 1 + words.length) % words.length)
    setSelectedSentenceIndex(0)
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 max-w-5xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white">Lecciones Conversacionales Fonéticas</h1>
              <p className="text-xs text-slate-400">Fonética en Español Natural sin IPA • 3 a 5 frases conversacionales por término</p>
            </div>
            <span className="text-xs text-slate-400 font-medium bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              Palabra {currentIndex + 1} de {words.length}
            </span>
          </div>

          {/* Main Flashcard Container */}
          <div className="glass-panel rounded-3xl p-8 border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Categoría: {currentWord.category}
                </span>
                <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-bold px-3 py-1 rounded-full">
                  Nivel {currentWord.level}
                </span>
              </div>
            </div>

            {/* Word Display */}
            <div className="text-center mb-8 border-b border-white/10 pb-6">
              <h2 className="text-4xl font-black text-white tracking-wide mb-2">
                {currentWord.term}
              </h2>
              <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                  🇪🇸 {currentWord.spanishTranslation}
                </span>
                <span className="text-sm font-semibold text-cyan-300 bg-cyan-500/10 px-3 py-1 rounded-lg border border-cyan-500/20">
                  🔊 /{currentWord.spanishPhonetics}/
                </span>
              </div>
            </div>

            {/* Sentences Carousel Selection */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {currentWord.sentences.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedSentenceIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedSentenceIndex === idx
                      ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Frase {idx + 1}
                </button>
              ))}
            </div>

            {/* Formato Obligatorio de Presentación de Frases */}
            {currentSentence && (
              <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>🇺🇸 Inglés (English Sentence)</span>
                    <button
                      onClick={() => handlePlayAudio(currentSentence.english, 'Matthew')}
                      disabled={isPlayingAudio}
                      className="flex items-center gap-1.5 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-500/40 font-bold transition-all disabled:opacity-50"
                    >
                      <span>{isPlayingAudio ? '🔊 Reproduciendo...' : '🇺🇸 Escuchar Audio Nativo (Inglés)'}</span>
                    </button>
                  </div>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {currentSentence.english}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    🗣️ Sistema Dual de Pronunciación para Hispanohablantes
                  </div>

                  {/* 🟢 Pronunciación Lenta — Voz español leyendo la fonética lenta */}
                  <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30">
                    <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>🟢 Pronunciación lenta</span>
                      <button
                        id="btn-audio-slow"
                        onClick={() => handlePlayAudio(normalizePhoneticsForTts(currentSentence.spanishPhonetics), 'Lupe', 'x-slow')}
                        disabled={isPlayingAudio}
                        className="flex items-center gap-1 text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded-lg border border-emerald-500/40 font-bold transition-all disabled:opacity-50"
                      >
                        {isPlayingAudio ? '🔊 ...' : '🟢 Escuchar Lenta'}
                      </button>
                    </div>
                    <p className="text-base font-bold text-emerald-300 font-mono">
                      {currentSentence.spanishPhonetics}
                    </p>
                  </div>

                  {/* 🟠 Pronunciación Natural — Voz español leyendo la fonética conectada */}
                  <div className="bg-amber-950/30 p-3 rounded-xl border border-amber-500/30">
                    <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>🟠 Cómo realmente lo escucharás</span>
                      <button
                        id="btn-audio-natural"
                        onClick={() => handlePlayAudio(normalizePhoneticsForTts(currentSentence.spanishPhoneticsNatural || currentSentence.spanishPhonetics), 'Lupe')}
                        disabled={isPlayingAudio}
                        className="flex items-center gap-1 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-1 rounded-lg border border-amber-500/40 font-bold transition-all disabled:opacity-50"
                      >
                        {isPlayingAudio ? '🔊 ...' : '🟠 Escuchar Natural'}
                      </button>
                    </div>
                    <p className="text-base font-bold text-amber-300 font-mono">
                      {currentSentence.spanishPhoneticsNatural || currentSentence.spanishPhonetics}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    🇪🇸 Traducción
                  </div>
                  <p className="text-lg font-medium text-slate-200">
                    {currentSentence.spanishTranslation}
                  </p>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/10">
              <button
                onClick={handlePrevWord}
                className="p-3 bg-slate-900 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={handleNextWord}
                disabled={isSavingProgress}
                className="flex-1 ml-4 p-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all text-center relative overflow-hidden disabled:opacity-50"
              >
                {isSavingProgress ? 'Guardando...' : 'Entendido (Añadir a mi mazo SM-2) →'}
                {xpToast && (
                  <span className="absolute top-0 right-0 h-full w-full flex items-center justify-center bg-green-500/90 text-white font-black text-lg animate-bounce">
                    +10 XP 🎉
                  </span>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
