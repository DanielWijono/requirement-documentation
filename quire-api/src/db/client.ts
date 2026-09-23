import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  return { db: drizzle(sql), sql }
}

export type Db = ReturnType<typeof createDb>['db']
