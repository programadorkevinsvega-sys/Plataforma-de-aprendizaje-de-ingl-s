import type { AuthSession } from '@/domain/entities/User'
import { ValidationError } from '@/domain/errors/DomainError'
import type {
  IAuthRepository,
  RegisterUserInput,
} from '@/domain/repositories/IAuthRepository'
import { registerSchema } from '../validation/authSchemas'

export class RegisterUserUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(input: RegisterUserInput): Promise<AuthSession> {
    const parsed = registerSchema.safeParse(input)

    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message).join(' | ')
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!fields[key]) fields[key] = issue.message
      }
      throw new ValidationError(`Revisa los datos: ${messages}`, fields)
    }

    return this.authRepository.register(parsed.data)
  }
}
