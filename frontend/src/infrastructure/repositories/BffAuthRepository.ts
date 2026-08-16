import type { AuthSession, User } from '@/domain/entities/User'
import { UnauthorizedError } from '@/domain/errors/DomainError'
import type {
  IAuthRepository,
  LoginUserInput,
  RegisterUserInput,
  UpdateProfileInput,
} from '@/domain/repositories/IAuthRepository'
import type { BffHttpClient } from '../api/BffHttpClient'
import { toAuthSession, toUser } from '../api/mappers'
import type { SessionStorage } from '../storage/SessionStorage'

type Dto = Record<string, unknown>

/**
 * Adaptador contra los endpoints de autenticación del BFF en Rust.
 * Solo aquí se conocen las rutas HTTP y el formato snake_case.
 */
export class BffAuthRepository implements IAuthRepository {
  constructor(
    private readonly http: BffHttpClient,
    private readonly session: SessionStorage,
  ) {}

  async register(input: RegisterUserInput): Promise<AuthSession> {
    try {
      const dto = await this.http.post<Dto>(
        '/api/v1/auth/register',
        {
          full_name: input.fullName,
          email: input.email,
          password: input.password,
          target_role: input.targetRole,
          current_level: input.currentLevel,
        },
        { skipAuth: true },
      )

      const session = toAuthSession(dto)
      this.session.clear()
      this.session.save(session)
      return session
    } catch (err) {
      console.error('Error en registro:', err)
      throw err
    }
  }

  async login(input: LoginUserInput): Promise<AuthSession> {
    try {
      const dto = await this.http.post<Dto>(
        '/api/v1/auth/login',
        { email: input.email, password: input.password },
        { skipAuth: true },
      )

      const session = toAuthSession(dto)
      this.session.clear()
      this.session.save(session)
      return session
    } catch (err) {
      console.error('Error en inicio de sesión:', err)
      throw err
    }
  }

  async logout(): Promise<void> {
    try {
      await this.http.post<void>('/api/v1/auth/logout')
    } catch {
      // La sesión local se destruye incluso si el BFF no responde.
    } finally {
      this.session.clear()
    }
  }

  async me(): Promise<User> {
    try {
      const dto = await this.http.get<Dto>('/api/v1/auth/me')
      const userDto = (dto.user ?? dto) as Dto
      return toUser(userDto)
    } catch {
      const stored = this.session.toSession()
      if (stored?.user) return stored.user
      throw new UnauthorizedError('Sesión no encontrada')
    }
  }

  async updateProfile(input: UpdateProfileInput): Promise<User> {
    try {
      const dto = await this.http.patch<Dto>('/api/v1/users/me', {
        full_name: input.fullName,
        target_role: input.targetRole,
        current_level: input.currentLevel,
      })

      const user = toUser((dto.user ?? dto) as Dto)
      const current = this.session.toSession()
      if (current) this.session.save({ ...current, user })
      return user
    } catch {
      const stored = this.session.toSession()
      if (stored?.user) {
        const updatedUser: User = {
          ...stored.user,
          fullName: input.fullName ?? stored.user.fullName,
          targetRole: input.targetRole ?? stored.user.targetRole,
          currentLevel: input.currentLevel ?? stored.user.currentLevel,
        }
        this.session.save({ ...stored, user: updatedUser })
        return updatedUser
      }
      throw new UnauthorizedError()
    }
  }

  getStoredSession(): AuthSession | null {
    return this.session.toSession()
  }
}
