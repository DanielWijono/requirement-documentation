import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  return { db: drizzle(sql), sql }
}

export type Db = ReturnType<typeof createDb>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Anything that can run queries: the pool or an open transaction. */
export type Queryable = Db | Tx
