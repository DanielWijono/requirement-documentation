import postgres from 'postgres'
import { createDb } from '../../src/db/client.ts'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://quire:quire@localhost:5433/postgres'

export const TEMPLATE_DB = 'quire_template'
/** One database per Vitest worker, cloned from the migrated template. */
export const TEST_DB = `quire_test_${process.env.VITEST_POOL_ID ?? '1'}`

export function dbUrl(name: string) {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  return url.toString()
}

export async function recreateDatabase(name: string, template?: string) {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"${template ? ` template "${template}"` : ''}`)
  } catch (err) {
    if ((err as { code?: string }).code === 'ECONNREFUSED') {
      throw new Error('Test Postgres is not reachable on :5433. Start it with `npm run services` from the repo root.')
    }
    throw err
  } finally {
    await admin.end()
  }
}

/** Empty every table in the public schema. Migration bookkeeping lives in the `drizzle` schema and survives. */
export async function truncateAll(sql: postgres.Sql) {
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`
  if (rows.length === 0) return
  await sql.unsafe(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`)
}

let handle: ReturnType<typeof createDb> | undefined

/** The current worker's database connection. */
export function testDb() {
  handle ??= createDb(dbUrl(TEST_DB))
  return handle
}

export async function closeTestDb() {
  await handle?.sql.end()
  handle = undefined
}
