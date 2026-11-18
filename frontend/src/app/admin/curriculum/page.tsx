'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import { sessionStorageAdapter } from '@/infrastructure/storage/SessionStorage'
import type {
  EditorialAction,
  EditorialDecision,
  EditorialVersionStatus,
  EditorialVersionSummary,
  EditorialVersionsPage,
  ImportCurriculumPackageResult,
} from '@/domain/repositories/ICurriculumRepository'

const PAGE_SIZE = 10

function statusLabel(status: EditorialVersionStatus): string {
  const labels: Record<EditorialVersionStatus, string> = {
    draft: 'Borrador',
    review: 'En revisión',
    published: 'Publicado',
    archived: 'Archivado',
  }
  return labels[status]
}

function statusTone(status: EditorialVersionStatus): string {
  const tones: Record<EditorialVersionStatus, string> = {
    draft: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
    review: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    published: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    archived: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  }
  return tones[status]
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CO')
}

export default function CurriculumAdminPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | EditorialVersionStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const [packageJson, setPackageJson] = useState('')
  const [preview, setPreview] = useState<ImportCurriculumPackageResult | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [reviewComments, setReviewComments] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const loadVersions = useCallback(async (): Promise<EditorialVersionsPage> => {
    const container = getContainer()
    const user = await container.useCases.getCurrentUser.execute()
    if (!user) {
      router.replace('/login')
      return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    return container.useCases.getCurriculumEditorialVersions.execute({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      search,
    })
  }, [page, router, search, statusFilter])

  const sessionUserId =
    typeof window === 'undefined'
      ? 'ssr'
      : (sessionStorageAdapter.read()?.user.id ?? 'anonymous')
  const cacheKey = [
    'curriculum-editorial-versions',
    sessionUserId,
    page,
    statusFilter,
    search.trim(),
  ].join(':')

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<EditorialVersionsPage>(cacheKey, loadVersions)

  const versions = data?.items ?? []
  const totalPages = data?.totalPages ?? 0

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setImportError(null)
    setImportMessage(null)
    setPreview(null)
    if (!file.name.toLowerCase().endsWith('.json')) {
      setImportError('Selecciona un archivo .json con formato curricular canónico.')
      return
    }
    if (file.size > 1_500_000) {
      setImportError('El paquete supera el límite de 1.5 MB.')
      return
    }
    try {
      const raw = await file.text()
      setPackageJson(raw)
      setSelectedFile(file.name)
    } catch {
      setImportError('No se pudo leer el archivo seleccionado.')
    }
  }

  const handlePreview = async () => {
    if (!packageJson.trim() || importBusy) return
    setImportBusy(true)
    setImportError(null)
    setImportMessage(null)
    setPreview(null)
    try {
      const container = getContainer()
      const result = await container.useCases.importCurriculumContentPackage.execute({
        packageJson,
        apply: false,
      })
      setPreview(result)
      if (result.state === 'already_imported') {
        setImportMessage('Este paquete ya está registrado con la misma huella SHA-256. No se creó una nueva versión.')
      } else {
        setImportMessage('Previsualización válida. PostgreSQL revirtió la transacción; todavía no se guardó ningún borrador.')
      }
    } catch (cause) {
      setImportError(
        cause instanceof Error ? cause.message : 'No se pudo validar el paquete curricular.',
      )
    } finally {
      setImportBusy(false)
    }
  }

  const handleApplyImport = async () => {
    if (!preview || preview.state !== 'imported' || !preview.dryRun || importBusy) return
    setImportBusy(true)
    setImportError(null)
    setImportMessage(null)
    try {
      const container = getContainer()
      const result = await container.useCases.importCurriculumContentPackage.execute({
        packageJson,
        apply: true,
      })
      setPreview(result)
      if (result.applied) {
        setImportMessage('Paquete importado correctamente como borrador. Aún necesita revisión y aprobación para publicarse.')
        setPage(1)
        await mutate()
      } else if (result.state === 'already_imported') {
        setImportMessage('La misma versión ya fue importada. No se duplicó ni sobrescribió contenido.')
      }
    } catch (cause) {
      setImportError(
        cause instanceof Error ? cause.message : 'No se pudo guardar el borrador curricular.',
      )
    } finally {
      setImportBusy(false)
    }
  }

  const handleEditorialAction = async (
    version: EditorialVersionSummary,
    action: EditorialAction,
    decision?: EditorialDecision,
  ) => {
    if (activeVersionId) return
    const comments = selectedReviewId === version.courseVersionId
      ? reviewComments.trim()
      : ''
    if (action === 'review' && decision !== 'approved' && !comments) {
      setActionError('Para rechazar o solicitar cambios debes dejar comentarios.')
      return
    }
    setActiveVersionId(version.courseVersionId)
    setActionError(null)
    setActionMessage(null)
    try {
      const container = getContainer()
      const result = await container.useCases.manageCurriculumEditorialVersion.execute({
        courseVersionId: version.courseVersionId,
        action,
        decision,
        comments: action === 'review' ? comments : undefined,
      })
      setActionMessage(
        `${version.title}: ${statusLabel(result.previousStatus)} → ${statusLabel(result.nextStatus)}.`,
      )
      setReviewComments('')
      setSelectedReviewId(null)
      await mutate()
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'No se pudo completar la acción editorial.',
      )
    } finally {
      setActiveVersionId(null)
    }
  }

  const denied = error && (
    (error as { code?: string }).code === 'TENANT_ISOLATION_VIOLATION'
    || /permiso|editor|403|prohibid/i.test(error.message)
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 max-w-7xl space-y-8 p-5 sm:p-8">
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
              <span>🛠️</span>
              Administración académica
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Gestión curricular
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Importa paquetes canónicos, prepara borradores, registra decisiones editoriales
                  y publica únicamente las versiones aprobadas.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs text-slate-400">
                Acceso verificado por <code className="text-violet-200">content_editors</code>
              </div>
            </div>
          </header>

          {isLoading && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-sm text-violet-200" aria-live="polite">
              Verificando permisos y cargando la cola editorial…
            </div>
          )}

          {!isLoading && denied && (
            <section className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-7 sm:p-9" role="alert">
              <div className="text-3xl">🔐</div>
              <h2 className="mt-4 text-xl font-extrabold text-white">Tu cuenta no tiene acceso editorial</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                La API comprobó tu identidad y no encontró tu usuario en la tabla
                <code className="mx-1 text-amber-200">content_editors</code>.
                Un administrador debe provisionar esa capacidad en PostgreSQL. Ocultar botones
                en el frontend no concede permisos y esta pantalla no intenta hacerlo.
              </p>
            </section>
          )}

          {!isLoading && error && !denied && (
            <section className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6" role="alert">
              <h2 className="font-bold text-rose-200">No se pudo cargar la administración curricular</h2>
              <p className="mt-2 text-sm text-rose-100/70">{error.message}</p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="mt-4 rounded-lg border border-rose-300/30 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-400/10"
              >
                Reintentar
              </button>
            </section>
          )}

          {!isLoading && !error && (
            <>
              <section className="glass-panel space-y-5 rounded-3xl border border-white/10 p-5 sm:p-7" aria-label="Importación de paquetes curriculares">
                <div>
                  <h2 className="text-xl font-extrabold text-white">Importar paquete curricular</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Selecciona un paquete v1 o edita su JSON antes de validar. La previsualización
                    ejecuta las mismas inserciones y comprueba referencias y restricciones, pero
                    revierte todos los cambios. La confirmación solo crea un borrador.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-200 transition-colors hover:border-violet-400/40">
                    <span>📂</span>
                    Seleccionar JSON
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      onChange={(event) => {
                        void handleFile(event.target.files?.[0])
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  <span className="text-xs text-slate-500">
                    {selectedFile || 'Sin archivo seleccionado · máximo 1.5 MB'}
                  </span>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Editor del paquete JSON
                  </span>
                  <textarea
                    value={packageJson}
                    onChange={(event) => {
                      setPackageJson(event.target.value)
                      setPreview(null)
                      setImportError(null)
                      setImportMessage(null)
                    }}
                    rows={12}
                    spellCheck={false}
                    placeholder={'Pega aquí el paquete devfluency.curriculum-content v1…'}
                    className="w-full resize-y rounded-2xl border border-white/10 bg-slate-950/80 p-4 font-mono text-xs leading-6 text-slate-200 outline-none placeholder:text-slate-700 focus:border-violet-400/40"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePreview()}
                    disabled={!packageJson.trim() || importBusy}
                    className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-5 py-3 text-xs font-extrabold text-violet-100 transition-colors hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importBusy && !preview?.dryRun ? 'Validando paquete…' : 'Validar y previsualizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApplyImport()}
                    disabled={!preview || preview.state !== 'imported' || !preview.dryRun || importBusy}
                    className="rounded-xl bg-cyan-400 px-5 py-3 text-xs font-extrabold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importBusy && preview?.dryRun ? 'Guardando borrador…' : 'Confirmar importación como borrador'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile('')
                      setPackageJson('')
                      setPreview(null)
                      setImportError(null)
                      setImportMessage(null)
                    }}
                    disabled={importBusy}
                    className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-slate-400 hover:text-white disabled:opacity-40"
                  >
                    Limpiar
                  </button>
                </div>

                {importError && (
                  <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs leading-5 text-rose-200" role="alert">
                    {importError}
                  </p>
                )}
                {importMessage && (
                  <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-200" role="status">
                    {importMessage}
                  </p>
                )}
                {preview && (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-white">
                        {preview.dryRun ? 'Resultado de previsualización' : 'Resultado de importación'}
                      </h3>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                        {preview.state === 'already_imported'
                          ? 'Ya registrado'
                          : preview.applied
                            ? 'Borrador guardado'
                            : 'Dry-run · rollback'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {[
                        ['Unidades', preview.counts.units],
                        ['Lecciones', preview.counts.lessons],
                        ['Objetivos', preview.counts.objectives],
                        ['Referencias de vocabulario', preview.counts.vocabularyReferences],
                        ['Referencias de frases', preview.counts.sentenceReferences],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-xl font-black text-white">{value}</div>
                          <div className="mt-1 text-[9px] leading-4 text-slate-500">{label}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 break-all font-mono text-[10px] leading-5 text-slate-500">
                      SHA-256 · {preview.packageSha256}
                    </p>
                    {!preview.dryRun && preview.applied && (
                      <Link
                        href={`/courses/${encodeURIComponent(preview.courseVersionId)}`}
                        className="mt-3 inline-flex text-xs font-bold text-cyan-200 hover:text-cyan-100"
                      >
                        Abrir borrador importado →
                      </Link>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-5" aria-label="Cola de revisión curricular">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-extrabold text-white">Cola editorial</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Borradores, versiones en revisión y contenido publicado.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setPage(1)
                      }}
                      placeholder="Buscar curso…"
                      className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-xs text-white outline-none focus:border-violet-400/40"
                    />
                    <select
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value as 'all' | EditorialVersionStatus)
                        setPage(1)
                      }}
                      className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-xs text-white outline-none focus:border-violet-400/40"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="draft">Borradores</option>
                      <option value="review">En revisión</option>
                      <option value="published">Publicados</option>
                      <option value="archived">Archivados</option>
                    </select>
                  </div>
                </div>

                {actionError && (
                  <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200" role="alert">
                    {actionError}
                  </p>
                )}
                {actionMessage && (
                  <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200" role="status">
                    {actionMessage}
                  </p>
                )}

                {versions.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                    No hay versiones curriculares para estos filtros.
                  </div>
                )}

                <div className="space-y-4">
                  {versions.map((version) => {
                    const busy = activeVersionId === version.courseVersionId
                    return (
                      <article key={version.courseVersionId} className="glass-panel space-y-4 rounded-2xl border border-white/10 p-5 sm:p-6">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${statusTone(version.status)}`}>
                                {statusLabel(version.status)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {version.trackCode === 'technology' ? 'Inglés tecnológico' : 'Inglés general'} · {version.cefrLevel}
                              </span>
                              <span className="text-[10px] text-slate-500">v{version.versionNumber}</span>
                            </div>
                            <h3 className="mt-3 text-lg font-extrabold text-white">{version.title}</h3>
                            <p className="mt-1 text-xs text-slate-500">{version.slug}</p>
                            {version.description && (
                              <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">{version.description}</p>
                            )}
                          </div>
                          <Link
                            href={`/courses/${encodeURIComponent(version.courseVersionId)}`}
                            className="inline-flex shrink-0 text-xs font-bold text-cyan-200 hover:text-cyan-100"
                          >
                            Ver contenido →
                          </Link>
                        </div>

                        <div className="grid grid-cols-1 gap-3 border-y border-white/10 py-3 sm:grid-cols-3">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Importado</div>
                            <div className="mt-1 text-[10px] text-slate-400">{formatDate(version.importedAt)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Última decisión</div>
                            <div className="mt-1 text-[10px] text-slate-400">
                              {version.latestDecision || 'Sin decisiones registradas'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Huella del paquete</div>
                            <div className="mt-1 break-all font-mono text-[10px] text-slate-500">
                              {version.packageSha256 ? version.packageSha256.slice(0, 16) : 'No disponible'}
                            </div>
                          </div>
                        </div>

                        {version.latestComments && (
                          <div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.03] p-3">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-200/70">Comentarios editoriales</div>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{version.latestComments}</p>
                          </div>
                        )}

                        {version.status === 'review' && (
                          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                            <label className="block">
                              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                Comentarios de revisión (obligatorios para rechazo o cambios)
                              </span>
                              <textarea
                                rows={2}
                                value={selectedReviewId === version.courseVersionId ? reviewComments : ''}
                                onFocus={() => {
                                  if (selectedReviewId !== version.courseVersionId) {
                                    setReviewComments('')
                                    setSelectedReviewId(version.courseVersionId)
                                  }
                                }}
                                onChange={(event) => {
                                  setSelectedReviewId(version.courseVersionId)
                                  setReviewComments(event.target.value)
                                }}
                                placeholder="Registra observaciones concretas sobre la calidad y cobertura del curso…"
                                className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-white outline-none focus:border-violet-400/40"
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={Boolean(activeVersionId)}
                                onClick={() => void handleEditorialAction(version, 'review', 'approved')}
                                className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-40"
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(activeVersionId) && !busy}
                                onClick={() => void handleEditorialAction(version, 'review', 'changes_requested')}
                                className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] font-bold text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
                              >
                                Solicitar cambios
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(activeVersionId) && !busy}
                                onClick={() => void handleEditorialAction(version, 'review', 'rejected')}
                                className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[10px] font-bold text-rose-200 hover:bg-rose-400/20 disabled:opacity-40"
                              >
                                Rechazar
                              </button>
                              {busy && <span className="self-center text-[10px] text-slate-500">Guardando decisión…</span>}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {version.status === 'draft' && (
                            <button
                              type="button"
                              disabled={Boolean(activeVersionId)}
                              onClick={() => void handleEditorialAction(version, 'submit')}
                              className="rounded-xl bg-violet-400 px-4 py-2.5 text-[10px] font-extrabold text-slate-950 hover:bg-violet-300 disabled:opacity-40"
                            >
                              Enviar a revisión
                            </button>
                          )}
                          {version.status === 'review' && version.canPublish && (
                            <button
                              type="button"
                              disabled={Boolean(activeVersionId)}
                              onClick={() => void handleEditorialAction(version, 'publish')}
                              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-[10px] font-extrabold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
                            >
                              Publicar versión aprobada
                            </button>
                          )}
                          {version.status === 'review' && !version.canPublish && (
                            <span className="text-[10px] text-slate-500">
                              Publicación disponible solo para el editor que registró la última aprobación.
                            </span>
                          )}
                          {busy && version.status !== 'review' && (
                            <span className="text-[10px] text-slate-500">Procesando…</span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>

                {totalPages > 1 && (
                  <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4" aria-label="Paginación de cola editorial">
                    <span className="text-xs text-slate-500">
                      Página {data?.page ?? page} de {totalPages} · {data?.total ?? 0} versiones
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"
                      >
                        Siguiente
                      </button>
                    </div>
                  </nav>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
