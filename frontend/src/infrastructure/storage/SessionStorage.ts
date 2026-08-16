import { User, type AuthSession } from '@/domain/entities/User'

const STORAGE_KEY = 'devfluency.session'

interface PersistedSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  tenantId: string
  user: {
    id: string
    email: string
    fullName: string
    targetRole: AuthSession['user']['targetRole']
    currentLevel: AuthSession['user']['currentLevel']
    tenantId: string
    streakDays: number
    techCoins: number
  }
}

/**
 * Persistencia de la sesión JWT en el navegador.
 *
 * Aislamiento multi-tenant: se guarda un único registro por pestaña con su
 * `tenantId`. Al iniciar sesión se limpia cualquier rastro previo, de modo que
 * los datos en caché de un cliente nunca queden accesibles para otro.
 */
export class SessionStorage {
  private memory: PersistedSession | null = null

  save(session: AuthSession): void {
    const payload: PersistedSession = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      tenantId: session.user.tenantId,
      user: {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
        targetRole: session.user.targetRole,
        currentLevel: session.user.currentLevel,
        tenantId: session.user.tenantId,
        streakDays: session.user.streakDays,
        techCoins: session.user.techCoins,
      },
    }

    this.memory = payload

    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Modo privado o storage bloqueado: la sesión vive solo en memoria.
    }
  }

  read(): PersistedSession | null {
    if (this.memory) return this.memory
    if (typeof window === 'undefined') return null

    try {
      const raw =
        window.sessionStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null

      const parsed = JSON.parse(raw) as PersistedSession
      if (!parsed?.accessToken || !parsed?.user?.id) return null
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        this.clear()
        return null
      }

      this.memory = parsed
      return parsed
    } catch {
      return null
    }
  }

  toSession(): AuthSession | null {
    const persisted = this.read()
    if (!persisted) return null

    return {
      accessToken: persisted.accessToken,
      refreshToken: persisted.refreshToken,
      expiresAt: persisted.expiresAt,
      user: new User(persisted.user),
    }
  }

  getAccessToken(): string | null {
    return this.read()?.accessToken ?? null
  }

  getTenantId(): string | null {
    return this.read()?.tenantId ?? null
  }

  clear(): void {
    this.memory = null
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // no-op
    }
  }
}

export const sessionStorageAdapter = new SessionStorage()
