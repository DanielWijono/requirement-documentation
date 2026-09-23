import type { Db } from '../../src/db/client.ts'
import * as t from '../../src/db/schema.ts'

let n = 0
const next = () => ++n

export async function makeUser(db: Db, over: Partial<typeof t.user.$inferInsert> = {}) {
  const i = next()
  const [row] = await db
    .insert(t.user)
    .values({ id: `u.test-${i}`, name: `User ${i}`, email: `user${i}@test.local`, ...over })
    .returning()
  return row
}

export async function makeSpace(db: Db, over: Partial<typeof t.spaces.$inferInsert> & { ownerId: string }) {
  const i = next()
  const [row] = await db
    .insert(t.spaces)
    .values({ id: `sp.test-${i}`, key: `T${i}`, name: `Space ${i}`, ...over })
    .returning()
  return row
}

export async function makePage(db: Db, over: Partial<typeof t.pages.$inferInsert> & { spaceId: string; ownerId: string }) {
  const i = next()
  const [row] = await db
    .insert(t.pages)
    .values({ id: `pg.test-${i}`, title: `Page ${i}`, updatedById: over.ownerId, ...over })
    .returning()
  return row
}
