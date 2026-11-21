'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActivityAttemptResult,
  ActivitySubmission,
  StudentActivityView,
  StudentAnswer,
  StudentChoiceQuestion,
} from '@/domain/entities/Activity'
import { buildActivitySubmission, isStudentAnswerComplete, parseActivityAttemptResult } from '@/domain/entities/Activity'

interface AudioUploadReceipt {
  audioUploadId: string
}

export interface ActivityExerciseRendererProps {
  activity: StudentActivityView
  onSubmit: (submission: ActivitySubmission) => Promise<ActivityAttemptResult | null | void> | ActivityAttemptResult | null | void
  resolveAudioUrl?: (assetId: string) => string | null
  resolveImageUrl?: (assetId: string) => string | null
  uploadSpokenAudio?: (audio: Blob, durationMs: number) => Promise<AudioUploadReceipt>
  className?: string
  initialResult?: ActivityAttemptResult | null
  onContinue?: () => void
  continueLabel?: string
}

const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15'
const optionClass = 'flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-slate-800 transition hover:border-emerald-500 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50'

function ActivityStimulusPanel({
  activity,
  resolveAudioUrl,
  resolveImageUrl,
}: {
  activity: StudentActivityView
  resolveAudioUrl?: (assetId: string) => string | null
  resolveImageUrl?: (assetId: string) => string | null
}) {
  const stimulus = activity.stimulus
  if (!stimulus) return null

  if (stimulus.kind === 'image') {
    const imageUrl = resolveImageUrl?.(stimulus.assetId)
    return (
      <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4" aria-label="Imagen de la actividad">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={'Material visual: ' + activity.title} className="mx-auto max-h-96 max-w-full rounded-xl object-contain" />
        ) : (
          <p className="text-sm text-stone-600">El material visual está registrado, pero su recurso no está disponible.</p>
        )}
      </section>
    )
  }

  if (stimulus.kind === 'text') {
    return (
      <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4" aria-label="Texto de apoyo">
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{stimulus.text}</p>
      </section>
    )
  }

  const assetId = stimulus.kind === 'audio' ? stimulus.assetId : stimulus.audioAssetId
  const audioUrl = resolveAudioUrl?.(assetId)
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4" aria-label="Audio de la actividad">
      {stimulus.kind === 'text_and_audio' && (
        <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{stimulus.text}</p>
      )}
      {audioUrl ? (
        <audio controls preload="metadata" className="w-full" src={audioUrl}>
          Tu navegador no puede reproducir este audio.
        </audio>
      ) : (
        <p className="text-sm font-medium text-emerald-950">
          El audio está registrado, pero todavía no se pudo resolver su recurso de reproducción.
        </p>
      )}
      <p className="mt-2 text-xs text-emerald-900/70">
        Escucha las veces que necesites. La transcripción de los ejercicios de listening permanece oculta hasta el momento permitido.
      </p>
    </section>
  )
}

function ChoiceQuestions({
  questions,
  onChange,
}: {
  questions: StudentChoiceQuestion[]
  onChange: (answer: StudentAnswer) => void
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const update = (question: StudentChoiceQuestion, optionId: string, checked: boolean) => {
    const current = selections[question.questionId] ?? []
    const next = question.allowMultiple
      ? checked ? [...current, optionId] : current.filter((id) => id !== optionId)
      : checked ? [optionId] : []
    const normalized = { ...selections, [question.questionId]: next }
    setSelections(normalized)
    onChange({
      kind: 'question_choices',
      answers: questions
        .filter((item) => (normalized[item.questionId] ?? []).length > 0)
        .map((item) => ({ questionId: item.questionId, optionIds: normalized[item.questionId] ?? [] })),
    })
  }
  return (
    <div className="space-y-5">
      {questions.map((question, index) => (
        <fieldset key={question.questionId} className="space-y-3">
          <legend className="text-sm font-bold text-slate-900">
            {index + 1}. {question.prompt}
            {question.allowMultiple && <span className="ml-2 text-xs font-normal text-stone-500">Puedes elegir varias opciones</span>}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => (
              <label key={option.optionId} className={optionClass}>
                <input
                  type={question.allowMultiple ? 'checkbox' : 'radio'}
                  name={'question-' + question.questionId}
                  checked={(selections[question.questionId] ?? []).includes(option.optionId)}
                  onChange={(event) => update(question, option.optionId, event.target.checked)}
                  className="mt-0.5 accent-emerald-700"
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function SpokenRecorder({
  maxDurationSeconds,
  upload,
  onReady,
}: {
  maxDurationSeconds: number
  upload?: (audio: Blob, durationMs: number) => Promise<AudioUploadReceipt>
  onReady: (answer: StudentAnswer) => void
}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef(0)
  const [recording, setRecording] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const stopTimerRef = useRef<number | null>(null)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.stop()
    }
    stopTracks()
  }, [stopTracks])

  const start = async () => {
    setMessage(null)
    if (!upload) {
      setMessage('La carga segura de grabaciones todavía no está conectada.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('Este navegador no permite grabar audio. Prueba con un navegador compatible y HTTPS.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopTracks()
        setRecording(false)
        setMessage('La grabación se interrumpió. Inténtalo nuevamente.')
      }
      recorder.onstop = async () => {
        if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current)
        stopTimerRef.current = null
        setRecording(false)
        const durationMs = Math.max(1, Date.now() - startedAtRef.current)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stopTracks()
        setWorking(true)
        try {
          if (blob.size === 0) throw new Error('La grabación está vacía.')
          if (durationMs > maxDurationSeconds * 1000) throw new Error('La grabación superó el límite de duración.')
          const receipt = await upload(blob, durationMs)
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.audioUploadId)) {
            throw new Error('El servicio de carga devolvió un identificador de audio inválido.')
          }
          onReady({
            kind: 'spoken_audio',
            audioUploadId: receipt.audioUploadId,
            audioDurationMs: durationMs,
            transcript: null,
          })
          setMessage('Grabación cargada y lista para enviar.')
        } catch (cause) {
          setMessage(cause instanceof Error ? cause.message : 'No se pudo cargar la grabación.')
        } finally {
          setWorking(false)
        }
      }
      recorder.start(250)
      setRecording(true)
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
        setRecording(false)
      }, Math.max(250, maxDurationSeconds * 1000 - 250))
    } catch {
      stopTracks()
      setMessage('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
    }
  }

  const stop = () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current)
    stopTimerRef.current = null
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setRecording(false)
  }

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-800">Respuesta hablada · máximo {maxDurationSeconds} s</span>
        {!recording ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={working || !upload}
            aria-describedby={!upload ? 'spoken-upload-unavailable' : undefined}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? 'Procesando audio…' : upload ? 'Iniciar grabación' : 'Grabación no disponible'}
          </button>
        ) : (
          <button type="button" onClick={stop} className="rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-bold text-white">
            Detener y cargar
          </button>
        )}
        {recording && <span className="text-xs font-semibold text-rose-700" role="status">● Grabando</span>}
      </div>
      {!upload && (
        <p id="spoken-upload-unavailable" className="text-xs text-amber-800" role="status">
          La carga segura de audio todavía no está conectada. Esta actividad hablada permanece deshabilitada y no registrará evidencia ficticia.
        </p>
      )}
      {message && <p className="text-xs text-stone-600" role="status">{message}</p>}
    </div>
  )
}

function ActivityExerciseRendererSession({
  activity,
  onSubmit,
  resolveAudioUrl,
  resolveImageUrl,
  uploadSpokenAudio,
  className = '',
  initialResult = null,
  onContinue,
  continueLabel = 'Continuar',
}: ActivityExerciseRendererProps) {
  const activeDurationMs = useRef(0)
  const activeSince = useRef(0)
  const pendingSubmission = useRef<{ fingerprint: string; value: ActivitySubmission } | null>(null)
  const [answer, setAnswer] = useState<StudentAnswer | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [attemptResult, setAttemptResult] = useState<ActivityAttemptResult | null>(() => {
    if (!initialResult || initialResult.activityId !== activity.activityId || initialResult.activityVersion !== activity.activityVersion) return null
    return parseActivityAttemptResult(initialResult, activity)
  })
  const complete = answer !== null && isStudentAnswerComplete(activity, answer)

  useEffect(() => {
    activeDurationMs.current = 0
    activeSince.current = 0
    const resume = () => {
      if (activeSince.current === 0 && !document.hidden && document.hasFocus()) {
        activeSince.current = Date.now()
      }
    }
    const pause = () => {
      if (activeSince.current > 0) {
        activeDurationMs.current += Math.max(0, Date.now() - activeSince.current)
        activeSince.current = 0
      }
    }
    const onVisibilityChange = () => document.hidden ? pause() : resume()

    resume()
    window.addEventListener('blur', pause)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      pause()
      window.removeEventListener('blur', pause)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [activity.activityId, activity.activityVersion])

  const exercise = activity.exercise
  const directionLabel = (direction: 'english_to_spanish' | 'spanish_to_english') =>
    direction === 'english_to_spanish' ? 'Inglés a español' : 'Español a inglés'

  const questionRenderer = (questions: StudentChoiceQuestion[]) => (
    <ChoiceQuestions
      key={activity.activityId + ':' + activity.activityVersion + ':' + questions.map((question) => question.questionId).join(',')}
      questions={questions}
      onChange={setAnswer}
    />
  )

  const exerciseContent = (() => {
    switch (exercise.type) {
      case 'multiple_choice': {
        const selected = answer?.kind === 'selected_options' ? answer.optionIds : []
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            {exercise.allowMultiple && <p className="text-xs text-stone-500">Selecciona todas las opciones que correspondan.</p>}
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">{exercise.prompt}</legend>
              {exercise.options.map((option) => (
                <label key={option.optionId} className={optionClass}>
                  <input
                    type={exercise.allowMultiple ? 'checkbox' : 'radio'}
                    name={'activity-' + activity.activityId}
                    checked={selected.includes(option.optionId)}
                    onChange={(event) => setAnswer({
                      kind: 'selected_options',
                      optionIds: exercise.allowMultiple
                        ? event.target.checked ? [...selected, option.optionId] : selected.filter((id) => id !== option.optionId)
                        : event.target.checked ? [option.optionId] : [],
                    })}
                    className="mt-0.5 accent-emerald-700"
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </fieldset>
          </div>
        )
      }
      case 'translation':
      case 'vocabulary_recall':
        return (
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
              {exercise.type === 'translation' ? directionLabel(exercise.direction) : directionLabel(exercise.direction)}
            </span>
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            {exercise.type === 'translation' && <p className="rounded-xl bg-stone-50 p-4 text-lg font-bold text-slate-900">{exercise.sourceText}</p>}
            <label className="block text-xs font-semibold text-stone-600">
              Tu respuesta
              <textarea
                rows={3}
                maxLength={5000}
                value={answer?.kind === 'text' ? answer.value : ''}
                onChange={(event) => setAnswer({ kind: 'text', value: event.target.value })}
                className={fieldClass + ' mt-2'}
                placeholder="Escribe tu respuesta…"
              />
            </label>
          </div>
        )
      case 'fill_blank': {
        const values = answer?.kind === 'gap_answers'
          ? Object.fromEntries(answer.answers.map((item) => [item.gapId, item.value]))
          : {}
        const segments = exercise.promptTemplate.split(/(\{\{[0-9a-f-]{36}\}\})/gi)
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">Completa cada espacio con la palabra o expresión correcta.</p>
            <div className="flex flex-wrap items-center gap-2 text-base leading-9 text-slate-800">
              {segments.map((segment, index) => {
                const match = segment.match(/^\{\{([0-9a-f-]{36})\}\}$/i)
                if (!match) return <span key={'text-' + index} className="whitespace-pre-wrap">{segment}</span>
                const gapId = match[1]
                return (
                  <label key={gapId} className="inline-flex flex-col gap-1 text-xs font-semibold text-stone-600">
                    <span>Espacio {exercise.gapIds.indexOf(gapId) + 1}</span>
                    <input
                      aria-label={'Respuesta para espacio ' + (exercise.gapIds.indexOf(gapId) + 1)}
                      value={values[gapId] ?? ''}
                      onChange={(event) => {
                        const next = { ...values, [gapId]: event.target.value }
                        setAnswer({ kind: 'gap_answers', answers: exercise.gapIds.map((id) => ({ gapId: id, value: next[id] ?? '' })) })
                      }}
                      className="w-36 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                )
              })}
            </div>
          </div>
        )
      }
      case 'word_order': {
        const selected = answer?.kind === 'ordered_tokens' ? answer.tokenIds : []
        const selectedTokens = selected.map((id) => exercise.tokens.find((token) => token.tokenId === id)).filter((token): token is typeof exercise.tokens[number] => Boolean(token))
        const remaining = exercise.tokens.filter((token) => !selected.includes(token.tokenId))
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            <div className="min-h-14 rounded-xl border border-dashed border-emerald-500/50 bg-emerald-50 p-3">
              <div className="flex flex-wrap gap-2">
                {selectedTokens.length === 0 && <span className="text-xs text-emerald-900/60">Selecciona las palabras en el orden correcto.</span>}
                {selectedTokens.map((token, index) => (
                  <button key={token.tokenId} type="button" onClick={() => setAnswer({ kind: 'ordered_tokens', tokenIds: selected.filter((id) => id !== token.tokenId) })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white" aria-label={'Quitar ' + token.text}>
                    {index + 1}. {token.text} ×
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {remaining.map((token) => (
                <button key={token.tokenId} type="button" onClick={() => setAnswer({ kind: 'ordered_tokens', tokenIds: [...selected, token.tokenId] })} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-emerald-600">
                  {token.text}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAnswer({ kind: 'ordered_tokens', tokenIds: [] })} className="text-xs font-semibold text-stone-500 underline">Reiniciar orden</button>
          </div>
        )
      }
      case 'matching': {
        const pairs = answer?.kind === 'matching' ? answer.pairs : []
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            {exercise.leftItems.map((item) => {
              const selectedRight = pairs.find((pair) => pair.leftId === item.itemId)?.rightId ?? ''
              const assigned = new Set(pairs.filter((pair) => pair.leftId !== item.itemId).map((pair) => pair.rightId))
              return (
                <label key={item.itemId} className="grid items-center gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="text-sm font-semibold text-slate-800">{item.text}</span>
                  <select
                    value={selectedRight}
                    onChange={(event) => {
                      const nextPairs = pairs.filter((pair) => pair.leftId !== item.itemId && pair.rightId !== event.target.value)
                      if (event.target.value) nextPairs.push({ leftId: item.itemId, rightId: event.target.value })
                      setAnswer({ kind: 'matching', pairs: nextPairs })
                    }}
                    className={fieldClass}
                    aria-label={'Correspondencia para ' + item.text}
                  >
                    <option value="">Selecciona una correspondencia</option>
                    {exercise.rightItems.map((right) => (
                      <option key={right.itemId} value={right.itemId} disabled={assigned.has(right.itemId) && right.itemId !== selectedRight}>
                        {right.text}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        )
      }
      case 'listening_comprehension':
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            {questionRenderer(exercise.questions)}
          </div>
        )
      case 'dictation':
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            <label className="block text-xs font-semibold text-stone-600">
              Escribe exactamente lo que escuchas
              <textarea
                rows={4}
                maxLength={5000}
                value={answer?.kind === 'text' ? answer.value : ''}
                onChange={(event) => setAnswer({ kind: 'text', value: event.target.value })}
                className={fieldClass + ' mt-2'}
                placeholder="Tu transcripción…"
              />
            </label>
          </div>
        )
      case 'reading_comprehension':
        return (
          <div className="space-y-5">
            <article className="max-h-96 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Lectura</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">{exercise.passage}</p>
            </article>
            {questionRenderer(exercise.questions)}
          </div>
        )
      case 'grammar_transformation':
      case 'error_correction':
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            <p className="rounded-xl bg-stone-50 p-4 text-base font-semibold text-slate-900">{exercise.sourceSentence}</p>
            <label className="block text-xs font-semibold text-stone-600">
              {exercise.type === 'grammar_transformation' ? 'Escribe la oración transformada' : 'Escribe la oración corregida'}
              <textarea
                rows={3}
                maxLength={5000}
                value={answer?.kind === 'text' ? answer.value : ''}
                onChange={(event) => setAnswer({ kind: 'text', value: event.target.value })}
                className={fieldClass + ' mt-2'}
                placeholder="Escribe la oración completa…"
              />
            </label>
          </div>
        )
      case 'open_writing': {
        const value = answer?.kind === 'text' ? answer.value : ''
        const words = value.trim().split(/\s+/).filter(Boolean).length
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{exercise.prompt}</p>
            <label className="block text-xs font-semibold text-stone-600">
              Tu texto
              <textarea
                rows={8}
                maxLength={12000}
                value={value}
                onChange={(event) => setAnswer({ kind: 'text', value: event.target.value })}
                className={fieldClass + ' mt-2'}
                placeholder="Desarrolla tu respuesta…"
              />
            </label>
            <p className={'text-xs ' + (words < exercise.minWords || words > exercise.maxWords ? 'text-amber-700' : 'text-emerald-700')}>
              {words} palabras · mínimo {exercise.minWords} · máximo {exercise.maxWords}
            </p>
          </div>
        )
      }
      case 'guided_dialogue':
        return (
          <div className="space-y-4">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Escenario</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">{exercise.scenario}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">Tu interlocutor</p>
              <p className="mt-2 text-sm leading-6 text-slate-900">{exercise.openingPrompt}</p>
            </div>
            <SpokenRecorder
              maxDurationSeconds={activity.limits.maxAudioDurationSeconds ?? 60}
              upload={uploadSpokenAudio}
              onReady={setAnswer}
            />
            <p className="text-xs text-stone-500">Máximo de turnos: {exercise.maxTurns}. La pronunciación solo podrá medirse a partir del audio válido, nunca de una transcripción inventada.</p>
          </div>
        )
      default:
        return null
    }
  })()

  const submit = async () => {
    if (!answer || !complete || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmitMessage(null)
    try {
      const fingerprint = JSON.stringify(answer)
      let submission = pendingSubmission.current?.fingerprint === fingerprint
        ? pendingSubmission.current.value
        : null
      if (!submission) {
        submission = buildActivitySubmission(
          activity,
          answer,
          crypto.randomUUID(),
          Math.max(1, activeDurationMs.current + (activeSince.current > 0 ? Date.now() - activeSince.current : 0)),
        )
        pendingSubmission.current = { fingerprint, value: submission }
      }
      const result = await onSubmit(submission)
      if (result !== undefined && result !== null) {
        setAttemptResult(parseActivityAttemptResult(result, activity))
      } else {
        setSubmitMessage('Respuesta enviada y recibida por el servicio de aprendizaje.')
      }
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'No se pudo enviar la respuesta.')
    } finally {
      setSubmitting(false)
    }
  }

  const modalityLabel = useMemo(() => ({
    written: 'Escrita',
    spoken: 'Hablada',
    listening: 'Comprensión auditiva',
    practice: 'Práctica',
  }[activity.modality]), [activity.modality])

  return (
    <section className={'mx-auto w-full max-w-3xl space-y-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7 ' + className}>
      <header className="space-y-3 border-b border-stone-100 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{activity.cefrLevel === 'PRE_A1' ? 'Pre-A1' : activity.cefrLevel}</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{modalityLabel}</span>
          <span className="text-stone-500">Versión {activity.activityVersion}</span>
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-950">{activity.title}</h2>
        <p className="text-sm leading-6 text-stone-600">{activity.instructions}</p>
      </header>

      <ActivityStimulusPanel
        activity={activity}
        resolveAudioUrl={resolveAudioUrl}
        resolveImageUrl={resolveImageUrl}
      />

      <fieldset disabled={attemptResult !== null || submitting} className="space-y-4 disabled:opacity-80">
        <legend className="sr-only">Respuesta de la actividad</legend>
        {exerciseContent}
      </fieldset>

      {attemptResult && (
        <section
          className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-emerald-950">
              {attemptResult.state === 'evaluated'
                ? 'Resultado de la actividad'
                : attemptResult.state === 'pending_review'
                  ? 'Respuesta pendiente de revisión'
                  : 'Resultado no medible'}
            </h3>
            {attemptResult.score && (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-emerald-900">
                {attemptResult.score.earnedPoints}/{attemptResult.score.maxPoints} puntos · {attemptResult.score.normalizedScore.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-emerald-950">{attemptResult.feedback.summary}</p>
          {attemptResult.feedback.explanation && (
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/70">Explicación</p>
              <p className="mt-1 text-sm leading-6 text-emerald-950">{attemptResult.feedback.explanation}</p>
            </div>
          )}
          {attemptResult.feedback.revealedAnswer && (
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/70">Respuesta de referencia</p>
              <p className="mt-1 text-sm text-emerald-950">{attemptResult.feedback.revealedAnswer}</p>
            </div>
          )}
        </section>
      )}

      <footer className="space-y-3 border-t border-stone-100 pt-5">
        {activity.availableHints.length > 0 && (
          <p className="text-xs text-stone-500">
            Esta actividad dispone de {Math.min(activity.availableHints.length, activity.limits.maxHints)} pistas graduadas. La entrega del contenido de cada pista se gestiona en el servicio de sesión.
          </p>
        )}
        {submitError && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800" role="alert">{submitError}</p>}
        {submitMessage && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800" role="status">{submitMessage}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-stone-500" aria-live="polite">
            {attemptResult
              ? 'Resultado confirmado por el servicio de aprendizaje.'
              : complete
                ? 'Respuesta completa. Lista para enviar.'
                : 'Completa todos los campos obligatorios para continuar.'}
          </span>
          {attemptResult && onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-extrabold text-white transition hover:bg-emerald-800"
            >
              {continueLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!complete || submitting || submitMessage !== null || attemptResult !== null}
              className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              {submitting ? 'Enviando…' : 'Enviar respuesta'}
            </button>
          )}
        </div>
      </footer>
    </section>
  )
}

export function ActivityExerciseRenderer(props: ActivityExerciseRendererProps) {
  const activityKey = props.activity.activityId + ':' + props.activity.activityVersion
  return <ActivityExerciseRendererSession key={activityKey} {...props} />
}
