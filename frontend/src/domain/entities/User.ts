/**
 * Capa de Dominio — Entidad User.
 * No depende de React, Next.js ni de ningún cliente HTTP.
 */

export const TARGET_ROLES = [
  'BACKEND',
  'DEVOPS',
  'FULLSTACK',
  'MOBILE',
  'DATA',
] as const

export type TargetRole = string

export const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

export interface UserProps {
  id: string
  email: string
  fullName: string
  targetRole: string
  currentLevel: CefrLevel
  tenantId?: string
  streakDays?: number
  techCoins?: number
  createdAt?: string
}

export class User {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly targetRole: string
  readonly currentLevel: CefrLevel
  /** Identificador de tenant: garantiza el aislamiento de datos entre clientes. */
  readonly tenantId: string
  readonly streakDays: number
  readonly techCoins: number
  readonly createdAt: string | null

  constructor(props: UserProps) {
    if (!props.id) throw new Error('User.id es obligatorio')
    if (!props.email) throw new Error('User.email es obligatorio')

    this.id = props.id
    this.email = props.email
    this.fullName = props.fullName
    this.targetRole = props.targetRole
    this.currentLevel = props.currentLevel
    this.tenantId = props.tenantId ?? props.id
    this.streakDays = props.streakDays ?? 0
    this.techCoins = props.techCoins ?? 0
    this.createdAt = props.createdAt ?? null
  }

  get firstName(): string {
    return this.fullName?.trim().split(/\s+/)[0] ?? 'there'
  }

  get initials(): string {
    const parts = this.fullName?.trim().split(/\s+/) ?? []
    if (parts.length === 0) return this.email.slice(0, 2).toUpperCase()
    return parts
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('')
  }

  get roleLabel(): string {
    return this.targetRole || 'Software Engineer'
  }

  /** Un usuario solo puede leer recursos de su propio tenant. */
  canAccessTenant(tenantId: string): boolean {
    return this.tenantId === tenantId
  }
}

export interface AuthSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  user: User
}
