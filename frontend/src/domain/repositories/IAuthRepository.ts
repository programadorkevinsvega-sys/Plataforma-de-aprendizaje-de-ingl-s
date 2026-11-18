import type { AuthSession, CefrLevel, TargetRole, User } from '../entities/User'

export interface RegisterUserInput {
  fullName: string
  email: string
  password: string
  targetRole: TargetRole
  currentLevel: CefrLevel
}

export interface LoginUserInput {
  email: string
  password: string
}

export interface UpdateProfileInput {
  fullName?: string
  targetRole?: TargetRole
  currentLevel?: CefrLevel
}

export interface IAuthRepository {
  register(input: RegisterUserInput): Promise<AuthSession>
  login(input: LoginUserInput): Promise<AuthSession>
  logout(): Promise<void>
  /** Recupera el usuario del token guardado (`GET /api/v1/auth/me`). */
  me(): Promise<User>
  updateProfile(input: UpdateProfileInput): Promise<User>
  /** Sesión persistida en el cliente, aislada por tenant. */
  getStoredSession(): AuthSession | null
}
