import {
  BffUnavailableError,
  DomainError,
  TenantIsolationError,
  UnauthorizedError,
} from '@/domain/errors/DomainError'
import { sessionStorageAdapter, type SessionStorage } from '../storage/SessionStorage'
import { toAuthSession } from './mappers'

const configuredBffUrl = process.env.NEXT_PUBLIC_BFF_URL

if (!configuredBffUrl) {
  throw new Error(
    'NEXT_PUBLIC_BFF_URL no está configurada. Define la URL del BFF en frontend/.env.local antes de iniciar o compilar el frontend.',
  )
}

export const BFF_BASE_URL = configuredBffUrl.replace(/\/$/, '')

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Endpoints públicos como login/register no envían Authorization. */
  skipAuth?: boolean
  /** Evita otro intento de refresh al reintentar o revocar una sesión. */
  skipRefresh?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

interface BffErrorBody {
  message?: string
  error?: string
  code?: string
}

/**
 * Único punto de salida hacia el BFF escrito en Rust (`:8080`).
 *
 * Responsabilidades:
 * - Adjuntar el JWT y la cabecera `X-Tenant-Id` en cada llamada.
 * - Traducir códigos HTTP a errores de dominio.
 * - Limpiar la sesión ante un 401 para cortar cualquier fuga entre tenants.
 */
export class BffHttpClient {
  private refreshInFlight: {
    refreshToken: string
    promise: Promise<ReturnType<typeof toAuthSession>>
  } | null = null

  constructor(
    private readonly baseUrl: string = BFF_BASE_URL,
    private readonly session: SessionStorage = sessionStorageAdapter,
    private readonly onUnauthorized?: () => void,
  ) {}

  get baseUrlValue(): string {
    return this.baseUrl
  }

  private refreshSession(
    refreshToken: string,
    timeoutMs: number,
  ): Promise<ReturnType<typeof toAuthSession>> {
    if (this.refreshInFlight?.refreshToken === refreshToken) {
      return this.refreshInFlight.promise
    }

    const promise = (async () => {
      const current = this.session.toSession()
      if (!current || current.refreshToken !== refreshToken) {
        throw new Error('La sesión cambió antes de iniciar la renovación')
      }

      const refreshedDto = await this.request<Record<string, unknown>>(
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          body: { refresh_token: refreshToken },
          skipAuth: true,
          skipRefresh: true,
          timeoutMs,
        },
      )
      const refreshedSession = toAuthSession(refreshedDto)
      if (!refreshedSession.accessToken || !refreshedSession.refreshToken) {
        throw new Error('El BFF devolvió una sesión renovada incompleta')
      }

      // Nunca reemplazar una sesión distinta que haya iniciado mientras el
      // refresh estaba en vuelo (p. ej., logout seguido de otro login).
      const latest = this.session.toSession()
      if (!latest || latest.refreshToken !== refreshToken) {
        throw new Error('La sesión cambió durante la renovación')
      }

      this.session.clear()
      this.session.save(refreshedSession)
      return refreshedSession
    })()

    const flight = { refreshToken, promise }
    this.refreshInFlight = flight
    void promise.finally(() => {
      if (this.refreshInFlight === flight) this.refreshInFlight = null
    }).catch(() => {
      // El consumidor de refreshSession gestiona el rechazo.
    })
    return promise
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      query,
      skipAuth = false,
      skipRefresh = false,
      signal,
      timeoutMs = 30_000,
    } = options

    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    let requestAccessToken: string | null = null

    if (!skipAuth) {
      const token = this.session.getAccessToken()
      if (!token) throw new UnauthorizedError('No hay sesión activa')
      requestAccessToken = token
      headers.Authorization = `Bearer ${token}`

      const tenantId = this.session.getTenantId()
      if (tenantId) headers['X-Tenant-Id'] = tenantId
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    signal?.addEventListener('abort', () => controller.abort(), { once: true })

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      })
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `El BFF no respondió en ${Math.round(timeoutMs / 1000)}s.`
          : `No se pudo conectar con el BFF en ${this.baseUrl}.`
      throw new BffUnavailableError(this.baseUrl, reason)
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 204) return undefined as T

    const raw = await response.text()
    let parsed: unknown = null
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = { message: raw }
      }
    }

    if (response.ok) return parsed as T

    const errorBody = (parsed ?? {}) as BffErrorBody
    const message = errorBody.message ?? errorBody.error ?? response.statusText

    if (response.status === 401) {
      if (!skipAuth && !skipRefresh) {
        const currentSession = this.session.toSession()

        // Una respuesta tardía puede pertenecer a la sesión anterior. Si ya
        // se renovó o cambió de usuario, no consumas el refresh token nuevo.
        if (
          requestAccessToken &&
          currentSession?.accessToken &&
          currentSession.accessToken !== requestAccessToken
        ) {
          return await this.request<T>(path, { ...options, skipRefresh: true })
        }

        const refreshToken = currentSession?.refreshToken
        if (refreshToken) {
          try {
            await this.refreshSession(refreshToken, timeoutMs)
          } catch {
            // No borrar una sesión nueva si la renovación de una sesión vieja
            // terminó después de que el usuario volviera a iniciar sesión.
            const latest = this.session.toSession()
            if (latest?.refreshToken === refreshToken) {
              this.session.clear()
              this.onUnauthorized?.()
            }
            throw new UnauthorizedError('La sesión expiró o el refresh token fue rechazado.')
          }

          // Fuera del try/catch de refresh: errores de la petición reintentada
          // (p. ej., 403/500) no deben convertirse en 401 ni borrar la sesión.
          return await this.request<T>(path, { ...options, skipRefresh: true })
        }
      }

      if (!skipAuth) {
        const latest = this.session.toSession()
        if (
          requestAccessToken &&
          latest?.accessToken &&
          latest.accessToken !== requestAccessToken
        ) {
          return await this.request<T>(path, { ...options, skipRefresh: true })
        }
        if (!requestAccessToken || !latest) {
          throw new UnauthorizedError(message || undefined)
        }
        this.session.clear()
        this.onUnauthorized?.()
        throw new UnauthorizedError(message || undefined)
      }

      throw new DomainError(
        message || 'Credenciales o datos de autenticación no válidos.',
        'INVALID_CREDENTIALS',
      )
    }

    if (response.status === 403) {
      throw new TenantIsolationError(message || undefined)
    }

    if (response.status >= 500) {
      throw new BffUnavailableError(
        this.baseUrl,
        message || 'El BFF devolvió un error interno.',
      )
    }

    throw new DomainError(
      message || 'La solicitud al BFF falló.',
      errorBody.code ?? `HTTP_${response.status}`,
    )
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body })
  }

  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }
}
