import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { Db } from './client.ts'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Apply every pending drizzle-kit migration. A no-op until the first migration exists. */
export async function runMigrations(db: Db) {
  if (!existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)) return
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
