import { z } from 'zod'
import { CEFR_LEVELS } from '@/domain/entities/User'

const FREE_EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']

export const passwordSchema = z
  .string()
  .min(10, 'Usa al menos 10 caracteres')
  .regex(/[A-Z]/, 'Incluye una mayúscula')
  .regex(/[a-z]/, 'Incluye una minúscula')
  .regex(/[0-9]/, 'Incluye un número')
  .regex(/[^A-Za-z0-9]/, 'Incluye un símbolo')

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'Escribe tu nombre completo')
    .max(80, 'Máximo 80 caracteres'),
  email: z.email('Email inválido').trim().toLowerCase(),
  password: passwordSchema,
  targetRole: z.string().min(1, 'Elige tu rol objetivo'),
  currentLevel: z.enum(CEFR_LEVELS, { message: 'Elige tu nivel actual' }),
})

export type RegisterFormValues = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.email('Email inválido').trim().toLowerCase(),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const profileSchema = z.object({
  fullName: z.string().trim().min(3, 'Escribe tu nombre completo'),
  targetRole: z.string().min(1, 'Elige tu rol objetivo'),
  currentLevel: z.enum(CEFR_LEVELS),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

/** Fuerza de contraseña 0-4, para el medidor visual del registro. */
export function passwordStrength(value: string): number {
  let score = 0
  if (value.length >= 10) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/[0-9]/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  return score
}

/** Aviso suave: recomendamos email profesional, sin bloquear el registro. */
export function isFreeEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return Boolean(domain && FREE_EMAIL_DOMAINS.includes(domain))
}
