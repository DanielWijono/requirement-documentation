import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { makePage, makeSpace, makeUser } from './helpers/factories.ts'
import { testDb } from './helpers/db.ts'

const db = () => testDb().db

/** The Postgres error behind a failed drizzle query. */
async function pgError(query: Promise<unknown>) {
  const err = await query.then(
    () => undefined,
    (e: unknown) => e as { cause?: { code?: string; constraint_name?: string } },
  )
  return err?.cause
}

let ownerId: string
let spaceId: string

beforeEach(async () => {
  ownerId = (await makeUser(db())).id
  spaceId = (await makeSpace(db(), { ownerId })).id
})

describe('migrations', () => {
  it('enable trigram search', async () => {
    const rows = await db().execute(sql`select 1 from pg_extension where extname = 'pg_trgm'`)
    expect(rows).toHaveLength(1)
  })

  it('build a weighted search vector from the title and body', async () => {
    const page = await makePage(db(), { spaceId, ownerId, title: 'Queueing strategy', bodyText: 'payment events retry' })
    const [row] = await db()
      .select({ hit: sql<boolean>`search @@ websearch_to_tsquery('english', 'payments')` })
      .from(t.pages)
      .where(eq(t.pages.id, page.id))
    expect(row.hit).toBe(true)
  })
})

describe('page tree integrity', () => {
  it('rejects a page as its own parent', async () => {
    const page = await makePage(db(), { spaceId, ownerId })
    const err = await pgError(db().update(t.pages).set({ parentId: page.id }).where(eq(t.pages.id, page.id)))
    expect(err?.code).toBe('23514')
  })

  it('rejects moving a page below its own descendant', async () => {
    const root = await makePage(db(), { spaceId, ownerId })
    const child = await makePage(db(), { spaceId, ownerId, parentId: root.id })
    const grandchild = await makePage(db(), { spaceId, ownerId, parentId: child.id })
    const err = await pgError(db().update(t.pages).set({ parentId: grandchild.id }).where(eq(t.pages.id, root.id)))
    expect(err?.constraint_name).toBe('pages_no_cycle')
  })

  it('allows moving a page under a sibling', async () => {
    const a = await makePage(db(), { spaceId, ownerId })
    const b = await makePage(db(), { spaceId, ownerId })
    await db().update(t.pages).set({ parentId: a.id }).where(eq(t.pages.id, b.id))
    const [row] = await db().select().from(t.pages).where(eq(t.pages.id, b.id))
    expect(row.parentId).toBe(a.id)
  })

  it('keeps parent and child in the same space', async () => {
    const other = await makeSpace(db(), { ownerId })
    const parent = await makePage(db(), { spaceId: other.id, ownerId })
    const err = await pgError(makePage(db(), { spaceId, ownerId, parentId: parent.id }))
    expect(err?.constraint_name).toBe('pages_parent_space')
  })
})

describe('comment integrity', () => {
  it('keeps threads one level deep', async () => {
    const page = await makePage(db(), { spaceId, ownerId })
    const [top] = await db().insert(t.comments).values({ pageId: page.id, authorId: ownerId, body: 'top' }).returning()
    const [reply] = await db().insert(t.comments).values({ pageId: page.id, parentId: top.id, authorId: ownerId, body: 'reply' }).returning()
    const err = await pgError(db().insert(t.comments).values({ pageId: page.id, parentId: reply.id, authorId: ownerId, body: 'nested' }))
    expect(err?.constraint_name).toBe('comments_reply_depth')
  })

  it('keeps a reply on its comment’s page', async () => {
    const a = await makePage(db(), { spaceId, ownerId })
    const b = await makePage(db(), { spaceId, ownerId })
    const [top] = await db().insert(t.comments).values({ pageId: a.id, authorId: ownerId, body: 'top' }).returning()
    const err = await pgError(db().insert(t.comments).values({ pageId: b.id, parentId: top.id, authorId: ownerId, body: 'elsewhere' }))
    expect(err?.constraint_name).toBe('comments_reply_page')
  })
})

describe('check constraints', () => {
  it('only accept known space permissions', async () => {
    const err = await pgError(
      db().insert(t.spacePermissions).values({ spaceId, principalType: 'user', principalId: ownerId, perms: ['View', 'Superpower'] }),
    )
    expect(err?.constraint_name).toBe('space_permissions_known')
  })

  it('require upper-case space keys', async () => {
    const err = await pgError(makeSpace(db(), { ownerId, key: 'eng' }))
    expect(err?.constraint_name).toBe('spaces_key_format')
  })

  it('require lower-case labels without spaces', async () => {
    const page = await makePage(db(), { spaceId, ownerId })
    const err = await pgError(db().insert(t.pageLabels).values({ pageId: page.id, name: 'Two Words' }))
    expect(err?.constraint_name).toBe('page_labels_format')
  })

  it('store invite emails in lower case', async () => {
    const err = await pgError(
      db().insert(t.invites).values({ email: 'New@Example.com', tokenHash: 'x', invitedById: ownerId, expiresAt: new Date() }),
    )
    expect(err?.constraint_name).toBe('invites_email_lower')
  })
})
