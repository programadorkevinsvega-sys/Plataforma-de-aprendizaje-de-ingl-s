import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isFreeEmailDomain, passwordStrength, registerSchema } from '../../src/application/validation/authSchemas.ts'
import { DomainError, BffUnavailableError, ValidationError } from '../../src/domain/errors/DomainError.ts'
import { User } from '../../src/domain/entities/User.ts'
import { toAudioUrl, toMetricScores, toUser } from '../../src/infrastructure/api/mappers.ts'
import { cn } from '../../src/shared/lib/utils.ts'
import { toUiError } from '../../src/shared/lib/errors.ts'

test('User keeps tenant isolation and derives display properties', () => {
  const user = new User({
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ana@example.invalid',
    fullName: 'Ana María Vega',
    targetRole: 'BACKEND',
    currentLevel: 'A0',
    tenantId: 'tenant-a',
  })

  assert.equal(user.firstName, 'Ana')
  assert.equal(user.initials, 'AM')
  assert.equal(user.canAccessTenant('tenant-a'), true)
  assert.equal(user.canAccessTenant('tenant-b'), false)
  assert.throws(
    () => new User({ ...user, id: '', email: 'ana@example.invalid' }),
    /User.id es obligatorio/,
  )
})

test('registration schema normalizes email and rejects weak passwords', () => {
  const valid = registerSchema.safeParse({
    fullName: ' Ana Vega ',
    email: 'ANA@Example.Invalid',
    password: 'SecurePass1!',
    targetRole: 'BACKEND',
    currentLevel: 'A0',
  })

  assert.equal(valid.success, true)
  if (valid.success) {
    assert.equal(valid.data.fullName, 'Ana Vega')
    assert.equal(valid.data.email, 'ana@example.invalid')
  }

  assert.equal(
    registerSchema.safeParse({
      fullName: 'Ana Vega',
      email: 'ana@example.invalid',
      password: 'weak',
      targetRole: 'BACKEND',
      currentLevel: 'A0',
    }).success,
    false,
  )
})

test('password strength and free-email domain checks are deterministic', () => {
  assert.equal(passwordStrength(''), 0)
  assert.equal(passwordStrength('abcdefghij'), 1)
  assert.equal(passwordStrength('Abcdefghi1!'), 4)
  assert.equal(isFreeEmailDomain('student@GMAIL.COM'), true)
  assert.equal(isFreeEmailDomain('student@company.example'), false)
  assert.equal(isFreeEmailDomain('malformed-email'), false)
})

test('BFF mappers accept snake_case and clamp metric scores', () => {
  const user = toUser({
    id: 'user-1',
    email: 'student@example.invalid',
    full_name: 'Student Fixture',
    target_role: 'backend',
    current_level: 'a2',
    tenant_id: 'tenant-1',
  })

  assert.equal(user.fullName, 'Student Fixture')
  assert.equal(user.currentLevel, 'A2')
  assert.equal(user.tenantId, 'tenant-1')

  const scores = toMetricScores({
    listening_score: 120,
    grammar: -5,
    vocabulary: '71',
  })
  assert.equal(scores.listening, 100)
  assert.equal(scores.grammar, 0)
  assert.equal(scores.vocabulary, 71)
})

test('audio mapper preserves content type when converting base64', () => {
  assert.equal(
    toAudioUrl({ audio_base64: 'YWJj', content_type: 'audio/wav' }),
    'data:audio/wav;base64,YWJj',
  )
  assert.equal(toAudioUrl({ audio_url: 'https://cdn.example.invalid/a.mp3' }), 'https://cdn.example.invalid/a.mp3')
  assert.equal(toAudioUrl({}), '')
})

test('UI error mapper preserves typed error context', () => {
  const unavailable = toUiError(new BffUnavailableError('https://bff.example.invalid'))
  assert.equal(unavailable.title, 'BFF no disponible')
  assert.match(unavailable.hint ?? '', /NEXT_PUBLIC_BFF_URL/)

  const validation = toUiError(new ValidationError('Invalid input', { email: 'Required' }))
  assert.equal(validation.title, 'Datos inválidos')
  assert.deepEqual(validation.fields, { email: 'Required' })

  const domain = toUiError(new DomainError('Domain conflict'))
  assert.equal(domain.title, 'No se pudo completar')
  assert.equal(toUiError('unknown').message, 'Vuelve a intentarlo en unos segundos.')
})

test('class name helper merges conflicting Tailwind utilities', () => {
  assert.equal(cn('p-2', 'p-4', 'text-sm'), 'p-4 text-sm')
})
