'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { ExamResult } from '@/domain/entities/ExamResult'

const TRANSCRIBE_WS_PROTOCOL = 'devfluency.transcribe.v1'

function waitForWebSocketOpen(socket: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve()
      return
    }
    if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      reject(new Error('La conexión WebSocket se cerró antes de abrirse.'))
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let cleanup = () => {}
    const handleOpen = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('No se pudo abrir la conexión WebSocket de transcripción.'))
    }
    const handleClose = () => {
      cleanup()
      reject(new Error('El servidor cerró el WebSocket antes de iniciar la transcripción.'))
    }

    cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
      socket.removeEventListener('close', handleClose)
    }
    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Se agotó el tiempo de espera del WebSocket de transcripción.'))
    }, timeoutMs)

    socket.addEventListener('open', handleOpen, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    socket.addEventListener('close', handleClose, { once: true })
  })
}

export default function InterviewPage() {
  const router = useRouter()
  const [questionId, setQuestionId] = useState('')
  const [question, setQuestion] = useState('Tell me about a time you refactored a monolithic backend into microservices to decrease latency.')
  const [questionCategory, setQuestionCategory] = useState('System Design')
  const [questionDifficulty, setQuestionDifficulty] = useState('B2')
  const [userResponse, setUserResponse] = useState('')
  const [transcript, setTranscript] = useState('')
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isPlayingQuestion, setIsPlayingQuestion] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [examResult, setExamResult] = useState<ExamResult | null>(null)


  useEffect(() => {
    const container = getContainer()
    container.useCases.getInterviewQuestion.execute().then((q) => {
      if (q) {
        // q es una entidad InterviewQuestion con .prompt, .id, .category, .difficulty
        setQuestion(q.prompt)
        setQuestionId(q.id)
        if (q.category) setQuestionCategory(q.category)
        if (q.difficulty) setQuestionDifficulty(q.difficulty)
      }
    }).catch(() => {})
  }, [])

  // ──────────────────────────────────────────────
  // 🔊 TTS: Reproducir la pregunta con AWS Polly
  // ──────────────────────────────────────────────
  const handlePlayQuestion = async () => {
    if (isPlayingQuestion) return
    setIsPlayingQuestion(true)
    try {
      const container = getContainer()
      const audioDataUrl = await container.useCases.synthesizeSpeech.execute(question)
      if (audioDataUrl && audioDataUrl.startsWith('data:')) {
        const audio = new Audio(audioDataUrl)
        audio.onended = () => setIsPlayingQuestion(false)
        audio.onerror = () => setIsPlayingQuestion(false)
        await audio.play()
        return
      }
    } catch (err) {
      console.warn('Error reproduciendo audio de pregunta:', err)
    }
    setIsPlayingQuestion(false)
  }

  // ──────────────────────────────────────────────
  // 🎙️ STT: AudioWorklet + WebSocket → AWS Transcribe en tiempo real
  // ──────────────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const intentionalWsShutdownRef = useRef(false)
  const [partialTranscript, setPartialTranscript] = useState('')

  const handleStartRecording = async () => {
    let activeStream: MediaStream | null = null
    intentionalWsShutdownRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      activeStream = stream

      // El WebSocket del navegador no admite Authorization personalizado.
      // Solicita el ticket justo antes de conectar para no consumir su TTL
      // mientras el usuario responde a la petición de permisos del micrófono.
      const container = getContainer()
      const ticket = await container.repositories.evaluator.createTranscribeTicket()

      // 1. Abrir WebSocket al BFF ANTES de iniciar el audio
      const bffWsUrl = (process.env.NEXT_PUBLIC_BFF_URL || 'http://localhost:8080')
        .replace(/^http/, 'ws')
      const ws = new WebSocket(
        `${bffWsUrl}/api/v1/exam/transcribe/ws`,
        [TRANSCRIBE_WS_PROTOCOL, `ticket.${ticket}`],
      )
      wsRef.current = ws

      ws.onopen = () => console.log('🔌 [WS Transcribe] Conexión abierta')
      ws.onerror = () => console.warn('No se pudo mantener la conexión WebSocket de transcripción')
      ws.onclose = () => {
        if (intentionalWsShutdownRef.current || wsRef.current !== ws) return

        activeStream?.getTracks().forEach((track) => track.stop())
        workletNodeRef.current?.disconnect()
        sourceNodeRef.current?.disconnect()
        sourceNodeRef.current?.mediaStream.getTracks().forEach((track) => track.stop())
        workletNodeRef.current = null
        sourceNodeRef.current = null
        if (audioContextRef.current) {
          void audioContextRef.current.close()
          audioContextRef.current = null
        }
        wsRef.current = null
        setIsRecording(false)
        setIsTranscribing(false)
        setTranscript((previous) => previous || '[La conexión de transcripción se cerró inesperadamente.]')
      }
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as {
            partial: string
            is_final: boolean
            done?: boolean
            error?: string
          }
          if (data.error) {
            console.error('❌ [WS Transcribe] Error del servidor:', data.error)
            return
          }
          if (data.partial) {
            setPartialTranscript(data.partial)
            if (data.is_final) {
              // Resultado final: moverlo al transcript definitivo
              setTranscript(prev => {
                const newText = (prev ? prev + ' ' : '') + data.partial
                setUserResponse(newText)
                return newText
              })
              setPartialTranscript('')
            }
          }
        } catch {
          // Ignorar mensajes no-JSON
        }
      }

      // No iniciar el AudioWorklet hasta que el handshake esté completado:
      // así no se pierden los primeros chunks mientras el socket sigue CONNECTING.
      await waitForWebSocketOpen(ws, 10_000)
      if (ws.protocol !== TRANSCRIBE_WS_PROTOCOL) {
        throw new Error('El servidor no negoció el subprotocolo de transcripción esperado.')
      }

      // 2. Crear AudioContext a 16kHz
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioCtx

      // 3. Cargar el AudioWorklet desde /pcm-worklet-processor.js (public/)
      await audioCtx.audioWorklet.addModule('/pcm-worklet-processor.js')
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error('El WebSocket se cerró antes de iniciar la captura de audio.')
      }

      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-worklet-processor')
      workletNodeRef.current = workletNode

      // 4. Recibir chunks PCM-16 de 640 bytes (20ms) y enviarlos por WS
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data) // Binary frame de 640 bytes
        }
      }

      const source = audioCtx.createMediaStreamSource(stream)
      sourceNodeRef.current = source
      source.connect(workletNode)
      // NO conectar al destination para no reproducir el micrófono
      workletNode.connect(audioCtx.destination)
      activeStream = null // El ciclo de grabación ya es dueño de este stream.

      setIsRecording(true)
      setTranscript('')
      setPartialTranscript('')
      console.log('🎙️ [AudioWorklet] Grabación iniciada — chunks PCM-16 de 20ms por WebSocket')
    } catch (err) {
      activeStream?.getTracks().forEach((track) => track.stop())
      workletNodeRef.current?.disconnect()
      sourceNodeRef.current?.disconnect()
      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
      console.error('Error iniciando grabación:', err)
      alert('No se pudo iniciar la transcripción segura. Verifica tu sesión y permite el acceso al micrófono.')
    }
  }

  const handleStopRecording = async () => {
    if (!isRecording) return
    setIsRecording(false)
    setIsTranscribing(true)

    // Desconectar nodos de audio
    workletNodeRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    sourceNodeRef.current?.mediaStream?.getTracks().forEach(t => t.stop())
    await audioContextRef.current?.close()
    audioContextRef.current = null

    // Enviar señal de fin al BFF (cierra la sesión de Transcribe después del resultado final).
    intentionalWsShutdownRef.current = true
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('stop')
    }

    // Esperar que llegue el mensaje final de Transcribe (max 5s)
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 5000)
      const ws = wsRef.current
      if (!ws) { clearTimeout(timeout); resolve(); return }
      const originalOnMessage = ws.onmessage
      ws.onmessage = (e) => {
        if (originalOnMessage) (originalOnMessage as (e: MessageEvent) => void)(e)
        try {
          const data = JSON.parse(e.data as string)
          if (data.done || (data.is_final && !data.partial)) {
            clearTimeout(timeout)
            resolve()
          }
        } catch { /* ignorar */ }
      }
      ws.onclose = () => { clearTimeout(timeout); resolve() }
    })

    wsRef.current?.close()
    wsRef.current = null
    setIsTranscribing(false)

    // Si no llegó nada, mostrar mensaje de ayuda
    setTranscript(prev => {
      if (!prev) setTranscript('[No se detectó audio. Habla más cerca del micrófono o escribe tu respuesta.]')
      return prev
    })
  }


  // ──────────────────────────────────────────────
  // 🤖 Evaluar respuesta con AWS Bedrock Claude
  // ──────────────────────────────────────────────
  const handleEvaluate = async () => {
    const answerToEvaluate = userResponse.trim() || transcript.trim()
    if (!answerToEvaluate) return
    setIsEvaluating(true)
    try {
      const container = getContainer()
      const result = await container.useCases.evaluateAnswer.execute({
        questionId: questionId || question, // Pasamos la pregunta como contexto para Claude
        question: question,
        answer: answerToEvaluate,
      })
      setExamResult(result)
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleStartDrill = () => {
    if (!examResult) return
    router.push(`/interview/drill?id=${examResult.id}`)
  }

  const handleViewResult = () => {
    if (!examResult) return
    const params = new URLSearchParams({
      id: examResult.id,
      score: String(examResult.overallScore ?? examResult.scores.listening),
      passed: String(examResult.passed),
    })
    router.push(`/interview/result?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 max-w-5xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-purple-500/30">
              🤖
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Simulador Reclutador IA (6 Métricas)</h1>
              <p className="text-xs text-slate-400">AWS Bedrock (Claude 3.5 Sonnet) + AWS Transcribe + AWS Polly Neural</p>
            </div>
          </div>

          {/* Question Card */}
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/30">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>🇺🇸 Reclutador Tech USA</span>
              <span className="bg-purple-500/20 text-purple-300 text-xs px-2.5 py-0.5 rounded-full font-mono">{questionCategory} · {questionDifficulty}</span>
            </div>
            <p className="text-xl font-bold text-white mb-4">&quot;{question}&quot;</p>
            {/* Botón de TTS para escuchar la pregunta */}
            <button
              onClick={handlePlayQuestion}
              disabled={isPlayingQuestion}
              className="flex items-center gap-2 text-xs font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-4 py-2 rounded-xl transition-all disabled:opacity-60"
            >
              {isPlayingQuestion ? (
                <>
                  <span className="animate-pulse">🔊</span>
                  <span>Reproduciendo pregunta...</span>
                </>
              ) : (
                <>
                  <span>🔊</span>
                  <span>Escuchar pregunta (AWS Polly Matthew)</span>
                </>
              )}
            </button>
          </div>

          {/* Voice Recording Panel */}
          <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 space-y-4">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              🎙️ Tu Respuesta — Voz o Texto
            </div>

            {/* Botones de grabación */}
            <div className="flex gap-3 flex-wrap">
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  disabled={isTranscribing || isEvaluating}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  🎙️ Iniciar Grabación
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-rose-500/20 animate-pulse"
                >
                  <span className="w-2 h-2 rounded-full bg-white inline-block" />
                  ⏹️ Detener y Transcribir
                </button>
              )}

              {isRecording && (
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  Grabando... habla ahora
                </div>
              )}

              {isTranscribing && (
                <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                  <span className="animate-spin">⚙️</span>
                  AWS Transcribe procesando...
                </div>
              )}
            </div>

            {/* Transcripción en tiempo real (mientras graba) */}
            {isRecording && partialTranscript && (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4">
                <div className="text-xs font-bold text-rose-400 mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse inline-block" />
                  Transcribiendo en tiempo real...
                </div>
                <p className="text-sm text-rose-100 font-mono italic">{partialTranscript}</p>
              </div>
            )}

            {/* Transcripción final obtenida */}
            {transcript && !transcript.startsWith('[') && (
              <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-4">
                <div className="text-xs font-bold text-cyan-400 mb-1">✅ Transcripción AWS Transcribe:</div>
                <p className="text-sm text-white font-mono">{transcript}</p>
              </div>
            )}
            {transcript && transcript.startsWith('[') && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4">
                <div className="text-xs font-bold text-amber-400 mb-1">⚠️ Aviso:</div>
                <p className="text-sm text-amber-200 font-mono">{transcript}</p>
              </div>
            )}

            {/* Textarea de respuesta (manual o editada) */}
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-2">
                ✏️ Editar / escribir respuesta manualmente:
              </label>
              <textarea
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
                placeholder="Ej: In my previous role, we identified that our monolithic database was the main bottleneck. We extracted the authentication service and migrated it to Rust with gRPC..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
              />
            </div>

            <button
              onClick={handleEvaluate}
              disabled={isEvaluating || isRecording || isTranscribing || (!userResponse.trim() && !transcript.trim())}
              className="w-full btn-primary text-center disabled:opacity-50"
            >
              {isEvaluating ? '🤖 Evaluando con AWS Bedrock Claude...' : '⚡ Evaluar Respuesta (Matriz 6 Métricas)'}
            </button>
          </div>

          {/* Results Breakdown */}
          {examResult && (
            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-white">Desglose Analítico de las 6 Métricas</h3>
                <div
                  className={`px-4 py-2 rounded-xl text-sm font-extrabold flex items-center gap-2 ${
                    examResult.passed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  <span>{examResult.passed ? '✅ APROBADO (Target ≥ 90.0%)' : '❌ NO ALCANZÓ 90.0% (Requiere Refuerzo)'}</span>
                  <span className="text-lg font-black">{examResult.totalScore.toFixed(1)}%</span>
                </div>
              </div>

              {/* 6 Metric Bars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricBar label="Listening (20%)" score={examResult.scoreListening} color="from-cyan-500 to-blue-500" />
                <MetricBar label="Pronunciación (20%)" score={examResult.scorePronunciation} color="from-blue-500 to-indigo-500" />
                <MetricBar label="Fluidez (20%)" score={examResult.scoreFluency} color="from-indigo-500 to-purple-500" />
                <MetricBar label="Vocabulario (15%)" score={examResult.scoreVocabulary} color="from-purple-500 to-pink-500" />
                <MetricBar label="Conversación (15%)" score={examResult.scoreConversation} color="from-pink-500 to-rose-500" />
                <MetricBar label="Gramática (10%)" score={examResult.scoreGrammar} color="from-amber-500 to-orange-500" />
              </div>

              {/* Corrección fonética de Claude + Drills */}
              {examResult.detectedWeaknesses.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base">
                    <span>🎯 Diagnóstico Quirúrgico: Áreas Débiles Aisladas</span>
                  </div>
                  <p className="text-xs text-amber-200/80">
                    La IA ha aislado las métricas con menor rendimiento. Lee la corrección fonética en voz alta:
                  </p>
                  <div className="space-y-3">
                    {examResult.detectedWeaknesses.map((w, idx) => {
                      const isPhonetic = w.tip.startsWith('🔊 Corrección fonética:')
                      return (
                        <div key={idx} className={`p-3 rounded-xl border flex items-start gap-3 ${isPhonetic ? 'bg-cyan-950/50 border-cyan-500/30' : 'bg-slate-900/80 border-amber-500/20'}`}>
                          <span className={`text-xs font-bold px-2 py-1 rounded ${isPhonetic ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {isPhonetic ? '🔊' : w.skill}: {!isPhonetic && `${w.score.toFixed(1)}%`}
                          </span>
                          <span className="text-xs text-slate-300 leading-relaxed">{w.tip}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleViewResult}
                      className="flex-1 glass-panel border border-white/10 text-white font-bold text-sm py-3 rounded-xl transition-all hover:border-white/20"
                    >
                      📊 Ver Resultado Detallado
                    </button>
                    <button
                      onClick={handleStartDrill}
                      className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-extrabold text-sm py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
                    >
                      🚀 Drill de Refuerzo 20 Min
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

const MetricBar: React.FC<{ label: string; score: number; color: string }> = ({ label, score, color }) => (
  <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
    <div className="flex justify-between text-xs font-bold text-slate-300 mb-1.5">
      <span>{label}</span>
      <span className={score >= 90 ? 'text-emerald-400' : 'text-amber-400'}>{score.toFixed(1)}%</span>
    </div>
    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
      <div className={`h-full bg-gradient-to-r ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
    </div>
  </div>
)
