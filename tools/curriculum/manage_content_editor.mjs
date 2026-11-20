import pg from 'pg'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { Client } = pg

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Grants or revokes the editorial capability for an existing application user.
 * The default operation is a dry run. Set apply=true to commit the change.
 */
export async function manageContentEditor({
  databaseUrl,
  email,
  action,
  apply = false,
  clientFactory = (url) => new Client({ connectionString: url }),
}) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 320) {
    throw new Error('Indica un correo electrónico válido de una cuenta ya registrada.')
  }
  if (action !== 'grant' && action !== 'revoke') {
    throw new Error('La acción debe ser grant o revoke.')
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio.')
  }

  const client = clientFactory(databaseUrl)
  await client.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const result = await client.query(
      `SELECT id::text AS id, email, full_name
         FROM public.users
        WHERE lower(email) = lower($1)
        FOR UPDATE`,
      [normalizedEmail],
    )
    if (result.rowCount !== 1) {
      throw new Error(
        result.rowCount === 0
          ? `No existe una cuenta con el correo ${normalizedEmail}. Registra la cuenta primero.`
          : 'El correo coincide con varias cuentas; corrige los duplicados antes de continuar.',
      )
    }

    const user = result.rows[0]
    const current = await client.query(
      'SELECT 1 FROM public.content_editors WHERE user_id = $1',
      [user.id],
    )
    const wasEditor = current.rowCount > 0
    const willBeEditor = action === 'grant'
    const changed = wasEditor !== willBeEditor

    if (apply && changed && action === 'grant') {
      await client.query(
        'INSERT INTO public.content_editors (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [user.id],
      )
    } else if (apply && changed && action === 'revoke') {
      await client.query('DELETE FROM public.content_editors WHERE user_id = $1', [user.id])
    }

    if (apply) {
      await client.query('COMMIT')
    } else {
      await client.query('ROLLBACK')
    }
    transactionOpen = false

    return {
      action,
      email: user.email,
      fullName: user.full_name,
      userId: user.id,
      wasEditor,
      willBeEditor,
      changed,
      applied: apply,
    }
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {})
    }
    throw error
  } finally {
    await client.end()
  }
}

function parseArgs(argv) {
  const args = { action: null, email: '', apply: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--grant') args.action = 'grant'
    else if (value === '--revoke') args.action = 'revoke'
    else if (value === '--apply') args.apply = true
    else if (value === '--email') args.email = argv[++index] ?? ''
    else if (value === '--help' || value === '-h') args.help = true
    else throw new Error(`Argumento no reconocido: ${value}`)
  }
  if (args.action === null && !args.help) throw new Error('Indica --grant o --revoke.')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      'Uso: DATABASE_URL=... node tools/curriculum/manage_content_editor.mjs --email cuenta@dominio.com --grant [--apply]\n' +
      'Sin --apply solo muestra el cambio y revierte la transacción. Usa --revoke para retirar el permiso.\n',
    )
    return
  }
  const result = await manageContentEditor({
    databaseUrl: process.env.DATABASE_URL,
    email: args.email,
    action: args.action,
    apply: args.apply,
  })
  process.stdout.write(
    `${result.applied ? 'Aplicado' : 'Simulación'}: ${result.action} ${result.email} ` +
    `(${result.fullName}); permiso anterior=${result.wasEditor}, ` +
    `permiso resultante=${result.willBeEditor}, cambio=${result.changed}\n`,
  )
  if (!result.applied && result.changed) {
    process.stdout.write('Repite el mismo comando con --apply para confirmar el cambio.\n')
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
