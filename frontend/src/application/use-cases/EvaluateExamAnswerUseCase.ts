import type {
  ExamResult,
  InterviewQuestion,
  WeaknessDrill,
} from '@/domain/entities/ExamResult'
import { ValidationError } from '@/domain/errors/DomainError'
import type {
  EvaluateAnswerInput,
  IAIEvaluatorRepository,
} from '@/domain/repositories/IAIEvaluatorRepository'

export class GetInterviewQuestionUseCase {
  constructor(private readonly evaluator: IAIEvaluatorRepository) {}

  execute(): Promise<InterviewQuestion> {
    return this.evaluator.getNextQuestion()
  }
}

export class EvaluateExamAnswerUseCase {
  constructor(private readonly evaluator: IAIEvaluatorRepository) {}

  async execute(input: EvaluateAnswerInput): Promise<ExamResult> {
    const answer = input.answer?.trim() ?? ''

    if (!input.audioBase64 && answer.split(/\s+/).filter(Boolean).length < 12) {
      throw new ValidationError(
        'Desarrolla tu respuesta: el reclutador necesita al menos 12 palabras para calificar las 6 métricas.',
        { answer: 'Respuesta demasiado corta' },
      )
    }

    return this.evaluator.evaluateAnswer({ ...input, answer })
  }
}

export class GetWeaknessDrillUseCase {
  constructor(private readonly evaluator: IAIEvaluatorRepository) {}

  execute(examResultId: string): Promise<WeaknessDrill> {
    return this.evaluator.getWeaknessDrill(examResultId)
  }
}

export class TranscribeAnswerUseCase {
  constructor(private readonly evaluator: IAIEvaluatorRepository) {}

  execute(audioBase64: string, mimeType: string): Promise<string> {
    return this.evaluator.transcribeAudio(audioBase64, mimeType)
  }
}
