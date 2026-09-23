import { createDb } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { TEMPLATE_DB, dbUrl, recreateDatabase } from './helpers/db.ts'

/** Build a migrated template database once per run; each worker clones it in setup.ts. */
export default async function setup() {
  await recreateDatabase(TEMPLATE_DB)
  const { db, sql } = createDb(dbUrl(TEMPLATE_DB))
  try {
    await runMigrations(db)
  } finally {
    await sql.end()
  }
}
