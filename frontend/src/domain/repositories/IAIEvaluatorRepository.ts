import type {
  ExamResult,
  InterviewQuestion,
  WeaknessDrill,
} from '../entities/ExamResult'

export interface EvaluateAnswerInput {
  questionId: string
  question: string
  answer: string
  /** Presente cuando el alumno respondió por micrófono (AWS Transcribe). */
  audioBase64?: string | null
}

export interface IAIEvaluatorRepository {
  /** El Reclutador IA (Bedrock Claude 3.5 Sonnet) genera una pregunta impredecible. */
  getNextQuestion(): Promise<InterviewQuestion>
  evaluateAnswer(input: EvaluateAnswerInput): Promise<ExamResult>
  /** Dril quirúrgico de 20 minutos sobre las 2 métricas más débiles. */
  getWeaknessDrill(examResultId: string): Promise<WeaknessDrill>
  /** Transcribe audio del micrófono con AWS Transcribe. */
  transcribeAudio(audioBase64: string, mimeType: string): Promise<string>
}
