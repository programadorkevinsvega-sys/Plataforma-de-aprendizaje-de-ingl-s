export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string = 'DOMAIN_ERROR',
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/** El BFF respondió 401/403 o no hay sesión válida en el cliente. */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Tu sesión expiró. Vuelve a iniciar sesión.') {
    super(message, 'UNAUTHORIZED')
    this.name = 'UnauthorizedError'
  }
}

/** Intento de leer datos de otro tenant: violación de aislamiento. */
export class TenantIsolationError extends DomainError {
  constructor(message = 'El recurso solicitado no pertenece a tu cuenta.') {
    super(message, 'TENANT_ISOLATION')
    this.name = 'TenantIsolationError'
  }
}

/** El BFF de Rust no está accesible o devolvió 5xx. */
export class BffUnavailableError extends DomainError {
  constructor(
    readonly baseUrl: string,
    message = 'No se pudo contactar al BFF.',
  ) {
    super(message, 'BFF_UNAVAILABLE')
    this.name = 'BffUnavailableError'
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}
