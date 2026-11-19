'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type {
  ComprehensionPage,
  ComprehensionResource,
  ComprehensionSkill,
} from '@/domain/repositories/IContentRepository'
import type { CefrLevel } from '@/domain/entities/User'

type TrackFilter = 'all' | 'general' | 'technology'
type LevelFilter = 'all' | CefrLevel

const PAGE_SIZE = 8
const LEVELS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'PRE_A1', label: 'Pre-A1' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
]

const EMPTY_PAGE: ComprehensionPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 0,
}

function levelLabel(level: string): string {
  return level === 'PRE_A1' ? 'Pre-A1' : level
}

function trackLabel(track: string): string {
  return track === 'technology' ? 'Profesional y tecnológico' : 'Inglés general'
}

function ResourceCard({ resource }: { resource: ComprehensionResource }) {
  const isListening = resource.skill === 'listening'

  return (
    <article className="glass-panel space-y-4 rounded-2xl border border-stone-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
          {isListening ? 'Listening' : 'Reading'}
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
          {levelLabel(resource.cefrLevel)}
        </span>
        <span className="text-stone-500">{trackLabel(resource.track)}</span>
      </div>

      <div>
        <h2 className="text-lg font-extrabold text-slate-900">{resource.title}</h2>
        <p className="mt-1 text-xs text-stone-500">
          {resource.topic || 'Práctica de comprensión'} · {resource.estimatedMinutes} min · {resource.wordCount} palabras
        </p>
      </div>

      {resource.comprehensionFocus && (
        <p className="rounded-xl bg-stone-50 p-3 text-sm leading-6 text-stone-700">
          <strong>Enfoque:</strong> {resource.comprehensionFocus}
        </p>
      )}

      {isListening ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          {resource.audioUrl ? (
            <audio controls preload="metadata" className="w-full" src={resource.audioUrl}>
              Tu navegador no puede reproducir este audio.
            </audio>
          ) : (
            <p className="text-sm text-stone-600">
              Este recurso todavía no tiene un audio aprobado y disponible.
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            La transcripción permanece oculta durante la escucha. No se muestra antes de responder.
          </p>
        </div>
      ) : (
        <div className="max-h-[34rem] overflow-y-auto rounded-xl border border-stone-200 bg-white p-5">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{resource.content}</p>
        </div>
      )}

      {resource.lexicalTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Vocabulario relacionado">
          {resource.lexicalTags.map((tag) => (
            <span key={tag} className="rounded-lg bg-stone-100 px-2.5 py-1 text-[10px] text-stone-600">
              {tag}
            </span>
          ))}
        </div>
      )}

      {resource.questions.length > 0 && (
        <details className="rounded-xl border border-stone-200 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">
            Objetivos de comprensión ({resource.questions.length})
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-700">
            {resource.questions.map((question) => (
              <li key={question.id}>
                <p>{question.prompt}</p>
                {question.options.length > 0 && (
                  <ul className="mt-2 list-[lower-alpha] space-y-1 pl-5 text-stone-600">
                    {question.options.map((option, index) => <li key={index}>{option}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-stone-500">
            Estas preguntas se presentan como guía de comprensión. El envío de respuestas,
            corrección y registro de intentos se conectará mediante el motor de actividades de la Fase 2.
          </p>
        </details>
      )}
    </article>
  )
}

export default function ComprehensionPage() {
  const router = useRouter()
  const [skill, setSkill] = useState<ComprehensionSkill>('reading')
  const [track, setTrack] = useState<TrackFilter>('all')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ComprehensionPage>(EMPTY_PAGE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const container = getContainer()
        const user = await container.useCases.getCurrentUser.execute()
        if (!active) return
        if (!user) {
          router.replace('/login')
          return
        }
        const result = await container.useCases.getComprehensionResources.execute({
          page,
          pageSize: PAGE_SIZE,
          skill,
          track: track === 'all' ? undefined : track,
          cefrLevel: level === 'all' ? undefined : level,
        })
        if (!active) return
        setData(result)
        setError(null)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los recursos.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [level, page, retryCount, router, skill, track])

  const changeSkill = (value: ComprehensionSkill) => {
    setSkill(value)
    setPage(1)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Centro de comprensión</p>
            <h1 className="mt-1 text-3xl font-extrabold text-slate-900">Reading y Listening</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Lee textos graduados y escucha materiales publicados para practicar la comprensión en inglés general y profesional.
            </p>
          </div>
          <Link href="/learn" className="text-sm font-bold text-emerald-800 hover:text-emerald-700">
            Volver a vocabulario →
          </Link>
        </header>

        <section className="flex flex-wrap gap-2" aria-label="Tipo de comprensión">
          <button
            type="button"
            onClick={() => changeSkill('reading')}
            aria-pressed={skill === 'reading'}
            className={'rounded-xl border px-5 py-3 text-sm font-bold ' + (skill === 'reading' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-700')}
          >
            Reading
          </button>
          <button
            type="button"
            onClick={() => changeSkill('listening')}
            aria-pressed={skill === 'listening'}
            className={'rounded-xl border px-5 py-3 text-sm font-bold ' + (skill === 'listening' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-700')}
          >
            Listening
          </button>
        </section>

        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2" aria-label="Filtros de recursos">
          <label className="text-xs font-semibold text-stone-600">
            Ruta
            <select
              value={track}
              onChange={(event) => { setTrack(event.target.value as TrackFilter); setPage(1) }}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-slate-900"
            >
              <option value="all">Todas las rutas</option>
              <option value="general">Inglés general</option>
              <option value="technology">Profesional y tecnológico</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Nivel
            <select
              value={level}
              onChange={(event) => { setLevel(event.target.value as LevelFilter); setPage(1) }}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-slate-900"
            >
              {LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </section>

        {loading && <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">Cargando recursos publicados…</div>}
        {error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-sm font-bold text-rose-900">No pudimos cargar los recursos.</p>
            <p className="mt-1 text-xs text-rose-800">{error}</p>
            <button type="button" onClick={() => { setLoading(true); setError(null); setRetryCount((count) => count + 1) }} className="mt-3 text-xs font-bold text-rose-900 underline">Reintentar</button>
          </div>
        )}

        {!loading && !error && data.items.length === 0 && (
          <div className="glass-panel rounded-2xl border border-stone-200 p-8 text-center">
            <h2 className="text-lg font-extrabold text-slate-900">
              {skill === 'reading' ? 'Todavía no hay lecturas publicadas' : 'Todavía no hay audios de escucha publicados'}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
              Solo se muestran recursos que pasaron la revisión editorial. Los borradores y materiales sin audio aprobado permanecen fuera del panel del estudiante.
            </p>
            {skill === 'listening' && (
              <p className="mt-2 text-xs text-stone-500">La transcripción no se muestra como sustituto del audio.</p>
            )}
          </div>
        )}

        {!loading && !error && data.items.length > 0 && (
          <>
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label={skill === 'reading' ? 'Lecturas publicadas' : 'Audios publicados'}>
              {data.items.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
            </section>
            {data.totalPages > 1 && (
              <nav className="flex items-center justify-between border-t border-stone-200 pt-4" aria-label="Paginación de recursos">
                <span className="text-xs text-stone-500">Página {data.page} de {data.totalPages} · {data.total} recursos</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))} className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">Siguiente</button>
                </div>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  )
}
