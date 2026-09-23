import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { seed } from '../db/seed.ts'
import { loadEnv } from '../env.ts'

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL)
try {
  await runMigrations(db)
  await seed(db, { nodeEnv: env.NODE_ENV })
  console.log('Seeded the demo workspace.')
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  await sql.end()
}
