import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { loadEnv } from '../env.ts'

const { db, sql } = createDb(loadEnv().DATABASE_URL)
try {
  await runMigrations(db)
  console.log('Migrations applied.')
} finally {
  await sql.end()
}
