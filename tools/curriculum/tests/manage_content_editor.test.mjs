import assert from 'node:assert/strict'
import { test } from 'node:test'
import { manageContentEditor } from '../manage_content_editor.mjs'

const registeredUser = {
  id: '00000000-0000-4000-8000-000000000201',
  email: 'editor@example.test',
  full_name: 'Editorial Operator',
}

function createFakeDatabase({ user = registeredUser, initiallyEditor = false } = {}) {
  const state = { user, isEditor: initiallyEditor, statements: [], connected: false, ended: false }
  const client = {
    async connect() { state.connected = true },
    async end() { state.ended = true },
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      state.statements.push({ sql: normalized, params })
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        if (normalized === 'COMMIT') state.committed = true
        if (normalized === 'ROLLBACK') state.rolledBack = true
        return { rows: [], rowCount: 0 }
      }
      if (normalized.includes('FROM public.users')) {
        return { rows: user ? [user] : [], rowCount: user ? 1 : 0 }
      }
      if (normalized.startsWith('SELECT 1 FROM public.content_editors')) {
        return { rows: state.isEditor ? [{ '?column?': 1 }] : [], rowCount: state.isEditor ? 1 : 0 }
      }
      if (normalized.startsWith('INSERT INTO public.content_editors')) {
        state.isEditor = true
        return { rows: [], rowCount: 1 }
      }
      if (normalized.startsWith('DELETE FROM public.content_editors')) {
        state.isEditor = false
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${normalized}`)
    },
  }
  return { state, client }
}

test('grant is dry-run by default and never writes to the editorial registry', async () => {
  const database = createFakeDatabase()
  const result = await manageContentEditor({
    databaseUrl: 'postgres://test.invalid/db',
    email: ' EDITOR@EXAMPLE.TEST ',
    action: 'grant',
    clientFactory: () => database.client,
  })

  assert.equal(result.email, registeredUser.email)
  assert.equal(result.changed, true)
  assert.equal(result.applied, false)
  assert.equal(database.state.isEditor, false)
  assert.equal(database.state.rolledBack, true)
  assert.equal(database.state.ended, true)
  assert.equal(database.state.statements.some(({ sql }) => sql.startsWith('INSERT')), false)
})

test('grant and revoke commit only after explicit apply=true', async () => {
  const database = createFakeDatabase()
  const grant = await manageContentEditor({
    databaseUrl: 'postgres://test.invalid/db',
    email: registeredUser.email,
    action: 'grant',
    apply: true,
    clientFactory: () => database.client,
  })
  assert.equal(grant.applied, true)
  assert.equal(database.state.isEditor, true)
  assert.equal(database.state.committed, true)

  const revokeDatabase = createFakeDatabase({ initiallyEditor: true })
  const revoke = await manageContentEditor({
    databaseUrl: 'postgres://test.invalid/db',
    email: registeredUser.email,
    action: 'revoke',
    apply: true,
    clientFactory: () => revokeDatabase.client,
  })
  assert.equal(revoke.applied, true)
  assert.equal(revokeDatabase.state.isEditor, false)
  assert.equal(revokeDatabase.state.committed, true)
})

test('unknown users are not provisioned implicitly', async () => {
  const database = createFakeDatabase({ user: null })
  await assert.rejects(
    manageContentEditor({
      databaseUrl: 'postgres://test.invalid/db',
      email: 'unknown@example.test',
      action: 'grant',
      apply: true,
      clientFactory: () => database.client,
    }),
    /Registra la cuenta primero/,
  )
  assert.equal(database.state.rolledBack, true)
  assert.equal(database.state.statements.some(({ sql }) => sql.startsWith('INSERT')), false)
})

test('invalid identity, action or missing database URL fails before connecting', async () => {
  let created = false
  const clientFactory = () => { created = true; throw new Error('should not connect') }
  await assert.rejects(
    manageContentEditor({ databaseUrl: 'postgres://test.invalid/db', email: 'not-an-email', action: 'grant', clientFactory }),
    /correo electrónico válido/,
  )
  await assert.rejects(
    manageContentEditor({ databaseUrl: 'postgres://test.invalid/db', email: registeredUser.email, action: 'admin', clientFactory }),
    /grant o revoke/,
  )
  await assert.rejects(
    manageContentEditor({ email: registeredUser.email, action: 'grant', clientFactory }),
    /DATABASE_URL/,
  )
  assert.equal(created, false)
})
