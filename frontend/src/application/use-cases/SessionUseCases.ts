import type { User } from '@/domain/entities/User'
import { ValidationError } from '@/domain/errors/DomainError'
import type {
  IAuthRepository,
  UpdateProfileInput,
} from '@/domain/repositories/IAuthRepository'
import { profileSchema } from '../validation/authSchemas'

export class GetCurrentUserUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(): Promise<User | null> {
    try {
      return await this.authRepository.me()
    } catch {
      return null
    }
  }
}

export class LogoutUserUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  execute(): Promise<void> {
    return this.authRepository.logout()
  }
}

export class UpdateProfileUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(input: UpdateProfileInput): Promise<User> {
    const parsed = profileSchema.partial().safeParse(input)
    if (!parsed.success) {
      throw new ValidationError('Datos de perfil inválidos.')
    }
    return this.authRepository.updateProfile(parsed.data)
  }
}
