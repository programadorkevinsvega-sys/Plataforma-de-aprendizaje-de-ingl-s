import {
  BffUnavailableError,
  DomainError,
  TenantIsolationError,
  UnauthorizedError,
} from '@/domain/errors/DomainError'
import { sessionStorageAdapter, type SessionStorage } from '../storage/SessionStorage'

export const BFF_BASE_URL =
  process.env.NEXT_PUBLIC_BFF_URL?.replace(/\/$/, '') ?? 'http://localhost:8080'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Endpoints públicos como login/register no envían Authorization. */
  skipAuth?: boolean
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
  constructor(
    private readonly baseUrl: string = BFF_BASE_URL,
    private readonly session: SessionStorage = sessionStorageAdapter,
    private readonly onUnauthorized?: () => void,
  ) {}

  get baseUrlValue(): string {
    return this.baseUrl
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      query,
      skipAuth = false,
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

    if (!skipAuth) {
      const token = this.session.getAccessToken()
      if (!token) throw new UnauthorizedError('No hay sesión activa')
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
      if (!skipAuth) {
        this.session.clear()
        this.onUnauthorized?.()
        throw new UnauthorizedError(message || undefined)
      } else {
        throw new DomainError(message || 'Credenciales o datos de autenticación no válidos.', 'INVALID_CREDENTIALS')
      }
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
