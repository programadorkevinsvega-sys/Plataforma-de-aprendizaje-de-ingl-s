import type {
  ExamResult,
  InterviewQuestion,
  WeaknessDrill,
} from '@/domain/entities/ExamResult'
import type {
  EvaluateAnswerInput,
  IAIEvaluatorRepository,
} from '@/domain/repositories/IAIEvaluatorRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import {
  toExamResult,
  toInterviewQuestion,
  toMetricScores,
  toWeaknessDrill,
} from '../api/mappers'

type Dto = Record<string, unknown>

/**
 * Reclutador IA. El BFF orquesta Bedrock (Claude 3.5 Sonnet) y AWS Transcribe;
 * el frontend nunca habla directamente con AWS ni guarda credenciales.
 */
export class BffAIEvaluatorRepository implements IAIEvaluatorRepository {
  constructor(private readonly http: BffHttpClient) {}

  async getNextQuestion(): Promise<InterviewQuestion> {
    const dto = await this.http.post<Dto>('/api/v1/exam/questions/next', {})
    // dto es el objeto completo {id, question, category, difficulty, context}
    // NO pasamos dto.question (que es una cadena) — pasamos dto
    return toInterviewQuestion(dto)
  }

  async evaluateAnswer(input: EvaluateAnswerInput): Promise<ExamResult> {
    // La evaluación por LLM puede tardar: se amplía el timeout a 90s.
    const dto = await this.http.post<Dto>(
      '/api/v1/exam/evaluate',
      {
        question_id: input.questionId,
        question: input.question,
        answer: input.answer,
        audio_base64: input.audioBase64 ?? null,
      },
      { timeoutMs: 90_000 },
    )

    return toExamResult((dto.result ?? dto) as Dto, {
      questionId: input.questionId,
      question: input.question,
      answer: input.answer,
    })
  }

  async getWeaknessDrill(examResultId: string): Promise<WeaknessDrill> {
    const dto = await this.http.get<Dto>(`/api/v1/exam/results/${examResultId}/drill`, {
      timeoutMs: 90_000,
    })

    const payload = (dto.drill ?? dto) as Dto
    return toWeaknessDrill(payload, toMetricScores(dto))
  }

  async transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    const dto = await this.http.post<Dto>(
      '/api/v1/exam/transcribe',
      { audio_base64: audioBase64, mime_type: mimeType },
      { timeoutMs: 90_000 },
    )

    const transcript = dto.transcript ?? dto.text ?? dto.transcription ?? ''
    return typeof transcript === 'string' ? transcript : ''
  }
}
