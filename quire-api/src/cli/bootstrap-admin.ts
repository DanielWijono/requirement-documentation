import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { MIN_PASSWORD_LENGTH } from '@quire/shared'
import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { loadEnv } from '../env.ts'
import { bootstrapAdmin } from '../services/users.ts'

// Usage: npm run bootstrap-admin -w quire-api -- --email you@example.com --name "Your Name"
// The password comes from QUIRE_ADMIN_PASSWORD, or is asked for.
const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } })
if (!values.email || !values.name) {
  console.error('Usage: npm run bootstrap-admin -- --email you@example.com --name "Your Name"')
  process.exit(1)
}

let password = process.env.QUIRE_ADMIN_PASSWORD
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  password = await rl.question(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `)
  rl.close()
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  process.exit(1)
}

const { db, sql } = createDb(loadEnv().DATABASE_URL)
try {
  await runMigrations(db)
  const admin = await bootstrapAdmin(db, { email: values.email, name: values.name, password })
  console.log(`Created site admin ${admin.email}. Sign in, then invite everyone else from the app.`)
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  await sql.end()
}
