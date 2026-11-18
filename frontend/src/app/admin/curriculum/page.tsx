'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { EditorialCourseVersion } from '@/domain/repositories/ICurriculumRepository'

const statuses = [
  ['all', 'Todos'],
  ['draft', 'Borradores'],
  ['review', 'En revisión'],
  ['published', 'Publicados'],
  ['archived', 'Archivados'],
] as const

function statusLabel(status: EditorialCourseVersion['status']) {
  return ({ draft: 'Borrador', review: 'En revisión', published: 'Publicado', archived: 'Archivado' })[status]
}

export default function CurriculumAdministrationPage() {
  const [filter, setFilter] = useState('all')
  const [comments, setComments] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const load = useCallback(() => getContainer().useCases.getEditorialCourseVersions.execute(filter === 'all' ? '' : filter), [filter])
  const { data = [], error, isLoading, mutate } = useSWR<EditorialCourseVersion[]>(['editorial-curriculum', filter], load)

  const runAction = async (version: EditorialCourseVersion, action: 'submit' | 'review' | 'publish', decision?: 'approved' | 'rejected' | 'changes_requested') => {
    const key = version.courseVersionId + action
    setBusy(key)
    setActionError(null)
    try {
      await getContainer().useCases.applyEditorialAction.execute({
        courseVersionId: version.courseVersionId,
        action,
        decision,
        comments: action === 'review' ? (comments[version.courseVersionId] ?? '') : undefined,
      })
      await mutate()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo completar la acción editorial.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 max-w-7xl space-y-7 p-5 sm:p-8">
          <header>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-300">Espacio editorial</p>
            <h1 className="mt-2 text-3xl font-black text-white">Administración curricular</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Revisa versiones curriculares y ejecuta transiciones protegidas por el registro content_editors.
              Las decisiones quedan en el historial inmutable y la publicación vuelve a validar la integridad en PostgreSQL.
            </p>
          </header>

          <nav className="flex flex-wrap gap-2" aria-label="Filtrar versiones">
            {statuses.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
                className={`rounded-xl border px-4 py-2 text-xs font-bold ${filter === value ? 'border-violet-400/50 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-slate-900/60 text-slate-400'}`}>
                {label}
              </button>
            ))}
          </nav>

          {actionError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">{actionError}</div>}
          {isLoading && <p className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-sm text-cyan-200">Cargando versiones editoriales…</p>}
          {error && <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">No se pudo consultar el espacio editorial. Verifica que tu usuario esté registrado en content_editors.</div>}
          {!isLoading && !error && data.length === 0 && <p className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-sm text-slate-400">No hay versiones para este filtro.</p>}

          <section className="space-y-4" aria-label="Versiones curriculares">
            {data.map((version) => (
              <article key={version.courseVersionId} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">{version.trackCode} · {version.cefrLevel} · v{version.versionNumber}</p>
                    <h2 className="mt-2 text-lg font-extrabold text-white">{version.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{version.slug}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-200">{statusLabel(version.status)}</span>
                </div>
                {version.description && <p className="mt-3 text-sm text-slate-400">{version.description}</p>}
                {version.latestDecision && <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300"><strong>Última decisión: {version.latestDecision}</strong>{version.latestComments && <p className="mt-1 text-slate-400">{version.latestComments}</p>}</div>}

                {version.status === 'draft' && (
                  <button disabled={busy !== null} onClick={() => void runAction(version, 'submit')} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-50">
                    {busy === version.courseVersionId + 'submit' ? 'Enviando…' : 'Enviar a revisión'}
                  </button>
                )}
                {version.status === 'review' && (
                  <div className="mt-4 space-y-3">
                    <textarea value={comments[version.courseVersionId] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [version.courseVersionId]: event.target.value }))} rows={2} placeholder="Comentarios de revisión (obligatorios para rechazar o solicitar cambios)" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy !== null} onClick={() => void runAction(version, 'review', 'approved')} className="rounded-xl bg-emerald-400/15 px-4 py-2.5 text-xs font-bold text-emerald-200 disabled:opacity-50">Aprobar</button>
                      <button disabled={busy !== null || !(comments[version.courseVersionId] ?? '').trim()} onClick={() => void runAction(version, 'review', 'changes_requested')} className="rounded-xl border border-amber-400/20 px-4 py-2.5 text-xs font-bold text-amber-200 disabled:opacity-40">Solicitar cambios</button>
                      <button disabled={busy !== null || !(comments[version.courseVersionId] ?? '').trim()} onClick={() => void runAction(version, 'review', 'rejected')} className="rounded-xl border border-rose-400/20 px-4 py-2.5 text-xs font-bold text-rose-200 disabled:opacity-40">Rechazar</button>
                      {version.latestDecision === 'approved' && <button disabled={busy !== null} onClick={() => void runAction(version, 'publish')} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-50">Publicar versión aprobada</button>}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  )
}
