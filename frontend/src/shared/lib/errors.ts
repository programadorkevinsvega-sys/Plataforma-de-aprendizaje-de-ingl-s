import { BffUnavailableError, DomainError, ValidationError } from '@/domain/errors/DomainError'

export interface UiError {
  title: string
  message: string
  hint?: string
  fields?: Record<string, string>
}

/** Traduce cualquier excepción a un mensaje presentable para el alumno. */
export function toUiError(error: unknown): UiError {
  if (error instanceof BffUnavailableError) {
    return {
      title: 'BFF no disponible',
      message: error.message,
      hint: `Verifica que el servicio de Rust esté escuchando en ${error.baseUrl} y que NEXT_PUBLIC_BFF_URL apunte allí.`,
    }
  }

  if (error instanceof ValidationError) {
    return { title: 'Datos inválidos', message: error.message, fields: error.fields }
  }

  if (error instanceof DomainError) {
    return { title: 'No se pudo completar', message: error.message }
  }

  if (error instanceof Error) {
    return { title: 'Error inesperado', message: error.message }
  }

  return { title: 'Error inesperado', message: 'Vuelve a intentarlo en unos segundos.' }
}
