import type { AuthSession } from '@/domain/entities/User'
import { ValidationError } from '@/domain/errors/DomainError'
import type {
  IAuthRepository,
  LoginUserInput,
} from '@/domain/repositories/IAuthRepository'
import { loginSchema } from '../validation/authSchemas'

export class LoginUserUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(input: LoginUserInput): Promise<AuthSession> {
    const parsed = loginSchema.safeParse(input)

    if (!parsed.success) {
      throw new ValidationError('Credenciales incompletas.')
    }

    return this.authRepository.login(parsed.data)
  }
}
