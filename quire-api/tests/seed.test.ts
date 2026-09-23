import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { labelToDate, seed, seedEmail } from '../src/db/seed.ts'
import * as t from '../src/db/schema.ts'
import { testDb } from './helpers/db.ts'

const db = () => testDb().db
const now = new Date('2026-09-23T12:00:00Z')

async function counts() {
  const tables = ['user', 'spaces', 'space_permissions', 'pages', 'page_drafts', 'page_versions', 'page_restrictions', 'comments', 'recent_views']
  const out: Record<string, number> = {}
  for (const name of tables) {
    const [row] = await db().execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${name}"`))
    out[name] = row.n
  }
  return out
}

describe('seed', () => {
  it('loads the demo workspace', async () => {
    await seed(db(), { now })
    expect(await counts()).toMatchObject({ user: 5, spaces: 4, space_permissions: 8, pages: 16 })
    const [admin] = await db().select().from(t.user).where(eq(t.user.id, 'u.daniel'))
    expect(admin).toMatchObject({ email: 'daniel@quire.local', siteRole: 'admin' })
  })

  it('is idempotent', async () => {
    await seed(db(), { now })
    const first = await counts()
    await seed(db(), { now })
    expect(await counts()).toEqual(first)
  })

  it('refuses to run in production', async () => {
    await expect(seed(db(), { nodeEnv: 'production' })).rejects.toThrow(/production/)
    expect((await counts()).user).toBe(0)
  })

  it('keeps unpublished changes as a draft next to the published body', async () => {
    await seed(db(), { now })
    const [page] = await db().select().from(t.pages).where(eq(t.pages.id, 'pg.adr-012'))
    const [draft] = await db().select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, 'pg.adr-012'))
    expect(page.status).toBe('published')
    expect(page.publishedHtml).toContain('six downstream consumers')
    expect(draft.html).toContain('nine downstream consumers')
    expect(page.bodyText).not.toMatch(/<[a-z]/)
  })

  it('keeps never-published pages as drafts with no published body', async () => {
    await seed(db(), { now })
    const [page] = await db().select().from(t.pages).where(eq(t.pages.id, 'pg.deploys'))
    expect(page).toMatchObject({ status: 'draft', publishedHtml: null, publishedVersion: 0 })
  })

  it('turns viewer lists into view restrictions', async () => {
    await seed(db(), { now })
    const rows = await db()
      .select({ id: t.pageRestrictions.principalId })
      .from(t.pageRestrictions)
      .where(and(eq(t.pageRestrictions.pageId, 'pg.benefits'), eq(t.pageRestrictions.kind, 'view')))
    expect(rows.map((r) => r.id).sort()).toEqual(['u.priya', 'u.wren'])
  })

  it('remembers what an archived page was before it was archived', async () => {
    await seed(db(), { now })
    const [page] = await db().select().from(t.pages).where(eq(t.pages.id, 'pg.old-api'))
    expect(page).toMatchObject({ status: 'archived', statusBeforeTrash: 'published' })
  })
})

describe('labelToDate', () => {
  it.each([
    ['Just now', 0],
    ['10 minutes ago', 10 * 60_000],
    ['3 hours ago', 3 * 3_600_000],
    ['Yesterday', 86_400_000],
    ['a month ago', 30 * 86_400_000],
    ['2 weeks ago', 14 * 86_400_000],
    ['1 year ago', 365 * 86_400_000],
  ])('%s', (label, ms) => expect(now.getTime() - labelToDate(label, now).getTime()).toBe(ms))
})

it('seedEmail derives a local address from the name', () => expect(seedEmail('Priya')).toBe('priya@quire.local'))

it('lets every seeded person sign in with the dev password', async () => {
  const { client, testApp } = await import('./helpers/app.ts')
  const { SEED_PASSWORD } = await import('../src/db/seed.ts')
  await seed(db(), { now })
  const res = await client(testApp()).post('/api/auth/sign-in/email', { email: seedEmail('Priya'), password: SEED_PASSWORD })
  expect(res.status).toBe(200)
})
