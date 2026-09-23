import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Health } from '@quire/shared'
import type { AppEnv } from '../app.ts'

export const health = new Hono<AppEnv>().get('/', async (c) => {
  let db: Health['db'] = 'up'
  try {
    await c.var.db.execute(sql`select 1`)
  } catch {
    db = 'down'
  }
  const body: Health = { ok: db === 'up', db }
  return c.json(body, db === 'up' ? 200 : 503)
})
