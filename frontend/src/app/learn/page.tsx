'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { VocabularyWord } from '@/domain/entities/VocabularyWord'
import type { CefrLevel } from '@/domain/entities/User'
import { LEXICAL_CATEGORIES } from '@/domain/entities/LexicalTaxonomy'

const PAGE_SIZE = 20
const LEVELS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'PRE_A1', label: 'Pre-A1' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
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
  const [track, setTrack] = useState<'all' | 'general' | 'technology'>('all')
  const [level, setLevel] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const container = getContainer()
    setLoading(true)
    setLoadError(null)

    const load = async () => {
      try {
        const user = await container.useCases.getCurrentUser.execute()
        if (!user) {
          router.replace('/login')
          return
        }
        const result = await container.useCases.getVocabularyPage.execute({
          page,
          pageSize: PAGE_SIZE,
          track: track === 'all' ? undefined : track,
          category: category === 'all' ? undefined : category,
          level: level as CefrLevel | 'all',
        })
        if (!active) return
        setWords(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setCurrentIndex(0)
        setSelectedSentenceIndex(0)
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar el vocabulario publicado.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [category, level, page, router, track])

  const handlePlayAudio = async (englishText: string, rate?: string) => {
    if (!englishText || isPlayingAudio) return
    setIsPlayingAudio(true)
    setActionError(null)
    try {
      // Both slow and natural modes synthesize the English source text.
      // The Spanish approximation is a visual learning aid, not TTS input.
      const speech = await getContainer().useCases.synthesizeSpeech.execute(englishText, 'Matthew', rate)
      if (!speech.audioUrl?.startsWith('data:')) {
        throw new Error('El proveedor de voz no devolvió un audio reproducible.')
      }
      const audio = new Audio(speech.audioUrl)
      audio.playbackRate = speech.playbackRate
      audio.onended = () => setIsPlayingAudio(false)
      audio.onerror = () => setIsPlayingAudio(false)
      await audio.play()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo reproducir el audio.')
      setIsPlayingAudio(false)
    }
  }

  const handleNextWord = async () => {
    const currentWord = words[currentIndex]
    if (!currentWord || isSavingProgress) return
    setIsSavingProgress(true)
    setActionError(null)
    try {
      await getContainer().useCases.recordLearningProgress.execute(currentWord.id)
      window.dispatchEvent(new Event('devfluency:xp-updated'))
      setXpToast(true)
      window.setTimeout(() => setXpToast(false), 1800)
      setCurrentIndex((index) => (index + 1) % words.length)
      setSelectedSentenceIndex(0)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar tu progreso.')
    } finally {
      setIsSavingProgress(false)
    }
  }

  const handlePreviousWord = () => {
    setCurrentIndex((index) => (index - 1 + words.length) % words.length)
    setSelectedSentenceIndex(0)
    setActionError(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Preparando tu práctica…</div>
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <div className="glass-panel max-w-xl rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-bold">Todavía no hay vocabulario publicado</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              El panel solo muestra palabras y ejemplos aprobados editorialmente. Cambia los filtros o vuelve al catálogo de cursos.
            </p>
            {loadError && <p role="alert" className="mt-3 text-xs text-rose-700">{loadError}</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/courses" className="btn-primary">Explorar cursos</Link>
              <Link href="/comprehension" className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-bold text-emerald-800">Reading y Listening</Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const currentWord = words[currentIndex]
  const currentSentence = currentWord?.sentences[selectedSentenceIndex] || currentWord?.sentences[0]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Práctica personal</p>
          <h1 className="mt-1 text-3xl font-extrabold">Centro de práctica</h1>
          <p className="mt-1 text-sm text-stone-600">Vocabulario publicado con ejemplos contextualizados y pronunciación dual.</p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Áreas de práctica">
          <span className="rounded-full border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-semibold text-white" aria-current="page">Vocabulario</span>
          <Link href="/comprehension" className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:border-emerald-700">Reading y Listening</Link>
          <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-500">Gramática, Writing y Speaking · Motor de actividades Fase 2</span>
        </nav>

        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filtros de vocabulario">
          <label className="text-xs font-semibold text-stone-600">
            Ruta
            <select value={track} onChange={(event) => { setTrack(event.target.value as typeof track); setPage(1) }} className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
              <option value="all">Todas las rutas</option>
              <option value="general">Inglés general</option>
              <option value="technology">Profesional y tecnológico</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Nivel
            <select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1) }} className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
              {LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Categoría
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }} className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
              <option value="all">Todas las categorías</option>
              {LEXICAL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.labelEs}</option>)}
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 text-xs text-stone-500">
            <span>{total} palabras publicadas · página {page}{totalPages > 0 ? ` de ${totalPages}` : ''}</span>
            <button type="button" onClick={() => { setTrack('all'); setLevel('all'); setCategory('all'); setPage(1) }} className="font-bold text-emerald-800">Reiniciar</button>
          </div>
        </section>

        {loadError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{loadError}</p>}

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
              {currentWord.definitionEnglish && <p className="mt-3 text-sm leading-6 text-slate-600">{currentWord.definitionEnglish}</p>}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {currentWord.lexicalType && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-600">{currentWord.lexicalType}</span>}
                {currentWord.lexicalRegister && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-600">{currentWord.lexicalRegister}</span>}
                {currentWord.usageMode && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-600">{currentWord.usageMode}</span>}
              </div>
            </div>
            {(currentWord.usefulness || currentWord.editorialPriority || currentWord.contextTags.length > 0) && (
              <div className="mt-3 rounded-xl border border-stone-200 p-3">
                {currentWord.usefulness && <p className="text-xs leading-5 text-stone-600"><strong>Utilidad:</strong> {currentWord.usefulness}</p>}
                {currentWord.editorialPriority && <p className="mt-1 text-xs text-stone-600"><strong>Prioridad:</strong> {currentWord.editorialPriority}</p>}
                {currentWord.contextTags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{currentWord.contextTags.map((tag) => <span key={tag} className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] text-stone-600">{tag}</span>)}</div>}
              </div>
            )}

            {currentWord.sentences.length > 0 && (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {currentWord.sentences.map((sentence, index) => (
                    <button key={sentence.id} type="button" onClick={() => setSelectedSentenceIndex(index)} aria-pressed={selectedSentenceIndex === index} className={'rounded-lg border px-3 py-2 text-xs font-semibold ' + (selectedSentenceIndex === index ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-600')}>
                      Ejemplo {index + 1}
                    </button>
                  ))}
                </div>

                {currentSentence && (
                  <div className="mt-4 rounded-xl border border-stone-200 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-stone-500">Texto original en inglés</span>
                      <button type="button" onClick={() => void handlePlayAudio(currentSentence.english)} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">
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
              </>
            )}

            <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-stone-100 pt-4">
              <button type="button" onClick={handlePreviousWord} disabled={words.length < 2} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-700 disabled:opacity-40">← Anterior</button>
              <button type="button" onClick={() => void handleNextWord()} disabled={isSavingProgress} className="btn-primary">
                {isSavingProgress ? 'Guardando…' : 'Marcar como practicado →'}
              </button>
            </div>
            {xpToast && <p role="status" className="mt-3 text-center text-sm font-bold text-emerald-800">Progreso guardado.</p>}
            {actionError && <p role="alert" className="mt-3 text-center text-xs font-semibold text-rose-700">{actionError}</p>}
          </article>

          <article className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Sistema dual de pronunciación</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-800">Para hispanohablantes</span>
            </div>
            {currentSentence ? (
              <>
                <div className="mt-4 rounded-xl bg-[#f4f1e7] p-4">
                  <span className="text-xs font-semibold text-stone-500">Texto original en inglés</span>
                  <p className="mt-1 text-lg font-bold">{currentSentence.english}</p>
                </div>
                {currentWord.pronunciationStatus === 'approved' &&
                currentSentence.spanishPhonetics.trim() &&
                currentSentence.pronunciationStatus === 'approved' &&
                currentSentence.spanishPhoneticsNatural.trim() ? (
                  <>
                    <div className="mt-3 rounded-xl border border-stone-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-stone-500">Guía aproximada para practicar lentamente</span>
                        <button type="button" onClick={() => void handlePlayAudio(currentSentence.english, 'slow')} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">▶ Escuchar lentamente</button>
                      </div>
                      <p className="mt-2 text-base font-semibold">{currentSentence.spanishPhonetics}</p>
                    </div>
                    <div className="mt-3 rounded-xl border border-stone-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-stone-500">Guía para pronunciación natural</span>
                        <button type="button" onClick={() => void handlePlayAudio(currentSentence.english)} disabled={isPlayingAudio} className="rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">▶ Escuchar a velocidad natural</button>
                      </div>
                      <p className="mt-2 text-base font-semibold">{currentSentence.spanishPhoneticsNatural}</p>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-stone-500">
                      Los dos audios utilizan la frase inglesa original. La guía escrita es una aproximación para hispanohablantes; no es IPA ni reemplaza una revisión fonética.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 rounded-xl bg-stone-50 p-4 text-xs leading-5 text-stone-600">
                    Este elemento no requiere guía fonética aprobada o el ejemplo todavía no dispone de ella. Puedes escuchar la frase original desde el control de vocabulario.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Esta palabra no tiene ejemplos publicados asociados.</p>
            )}
          </article>
        </section>

        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Qué registra esta práctica</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Se registra que has practicado esta palabra. Esto no equivale a una evaluación de gramática, escritura, comprensión auditiva o expresión oral, ni concede por sí solo dominio académico.
          </p>
        </section>

        {totalPages > 1 && (
          <nav className="flex items-center justify-between border-t border-stone-200 pt-4" aria-label="Paginación de vocabulario">
            <span className="text-xs text-stone-500">Página {page} de {totalPages} · {total} palabras</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">Anterior</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">Siguiente</button>
            </div>
          </nav>
        )}
        <div className="text-right text-xs"><Link href="/courses" className="font-semibold text-emerald-800">Volver al catálogo de cursos →</Link></div>
      </main>
    </div>
  )
}
