import { MEMBER_DEFAULT_PERMS, MEMBERS_GROUP_ID, SNIPPET_START, SNIPPET_STOP, type QuickSearchDto, type SearchResponseDto } from '@quire/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { signedIn, testApp, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'
import { makePage, makeSpace } from './helpers/factories.ts'

type Person = Client & { user: { id: string } }

let app: ReturnType<typeof testApp>
let owner: Person
let member: Person

const db = () => testDb().db
const DAY = 86_400_000

async function find(who: Person, params: Record<string, string>) {
  const res = await who.get(`/api/search?${new URLSearchParams(params)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as SearchResponseDto
}
const titles = (r: SearchResponseDto) => r.results.map((p) => p.title)

beforeEach(async () => {
  app = testApp()
  await db().insert(t.groups).values({ id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true })
  owner = await signedIn(app, { name: 'Olive Owner' })
  member = await signedIn(app, { name: 'Max Member' })
  const eng = await makeSpace(db(), { id: 'sp.eng', key: 'ENG', name: 'Engineering', ownerId: owner.user.id })
  const ops = await makeSpace(db(), { id: 'sp.ops', key: 'OPS', name: 'Operations', ownerId: owner.user.id })
  const secret = await makeSpace(db(), { id: 'sp.hr', key: 'HR', name: 'People team', ownerId: owner.user.id })
  await db()
    .insert(t.spacePermissions)
    .values([eng, ops].map((s) => ({ spaceId: s.id, principalType: 'group' as const, principalId: MEMBERS_GROUP_ID, perms: [...MEMBER_DEFAULT_PERMS] })))

  const page = (id: string, title: string, bodyText: string, over: Partial<typeof t.pages.$inferInsert> = {}) =>
    makePage(db(), { id, title, bodyText, spaceId: eng.id, ownerId: owner.user.id, status: 'published', updatedAt: new Date(Date.now() - 2 * DAY), ...over })
  await page('pg.roadmap', 'Payments roadmap', 'Quarterly plans for the payments team.')
  await page('pg.notes', 'Meeting notes', 'We discussed planning the payments migration <script> and more.')
  await page('pg.onboarding', 'Onboarding guide', 'Welcome aboard.', { spaceId: ops.id, isBlogPost: true, updatedById: member.user.id, updatedAt: new Date() })
  await page('pg.old', 'Old payments spec', 'Legacy payments design.', { updatedAt: new Date(Date.now() - 60 * DAY) })
  await page('pg.restricted', 'Payments salaries', 'Confidential payments numbers.')
  await page('pg.draft', 'Payments draft', 'Unpublished payments idea.', { status: 'draft' })
  await page('pg.hr', 'Payments payroll', 'HR payments.', { spaceId: secret.id })
  await db()
    .insert(t.pageRestrictions)
    .values({ pageId: 'pg.restricted', kind: 'view', principalType: 'user', principalId: owner.user.id })
  await db()
    .insert(t.pageLabels)
    .values([
      { pageId: 'pg.roadmap', name: 'payments' },
      { pageId: 'pg.old', name: 'payments' },
      { pageId: 'pg.restricted', name: 'payments' },
      { pageId: 'pg.notes', name: 'meetings' },
    ])
})

describe('search', () => {
  it('ranks title matches above body matches and stems words', async () => {
    const res = await find(member, { q: 'payments' })
    expect(titles(res)[0]).toBe('Payments roadmap')
    expect(titles(res)).toEqual(expect.arrayContaining(['Meeting notes', 'Old payments spec']))
    expect(titles(await find(member, { q: 'planning' }))).toEqual(expect.arrayContaining(['Payments roadmap', 'Meeting notes']))
  })

  it('finds titles with typos', async () => {
    expect(titles(await find(member, { q: 'onbording guide' }))).toEqual(['Onboarding guide'])
  })

  it('returns plain-text snippets with the matches marked', async () => {
    const [notes] = (await find(member, { q: 'migration' })).results
    expect(notes.title).toBe('Meeting notes')
    expect(notes.snippet).toContainEqual({ text: 'migration', match: true })
    // Parts are plain text: no markers left over and no markup from the body.
    const text = notes.snippet.map((s) => s.text).join('')
    for (const bad of [SNIPPET_START, SNIPPET_STOP, '<']) expect(text).not.toContain(bad)
    expect(notes.labels).toEqual(['meetings'])
  })

  it('never shows restricted pages, drafts or hidden spaces', async () => {
    const res = await find(member, { q: 'payments' })
    expect(titles(res)).not.toEqual(expect.arrayContaining(['Payments salaries']))
    expect(titles(res).some((x) => /salaries|draft|payroll/i.test(x))).toBe(false)
    expect(res.total).toBe(3)
    expect((await find(member, { q: 'payments', label: 'payments' })).relaxed).toEqual({ label: 3 })
    expect((await find(member, { q: 'confidential' })).results).toEqual([])
    // The owner sees the restricted page and the hidden space, but still not drafts.
    const mine = await find(owner, { q: 'payments' })
    expect(titles(mine)).toEqual(expect.arrayContaining(['Payments salaries', 'Payments payroll']))
    expect(titles(mine)).not.toContain('Payments draft')
  })

  it('filters by space, type, contributor, modified and label, reporting what each filter removes', async () => {
    expect(titles(await find(member, { q: 'payments', space: 'eng', label: 'payments' }))).toEqual(['Payments roadmap', 'Old payments spec'])
    expect(titles(await find(member, { type: 'blog' }))).toEqual(['Onboarding guide'])
    expect(titles(await find(member, { contributor: member.user.id }))).toEqual(['Onboarding guide'])
    expect(titles(await find(member, { modified: 'today' }))).toEqual(['Onboarding guide'])
    expect(titles(await find(member, { modified: 'month', sort: 'modified' }))).toEqual(['Onboarding guide', 'Meeting notes', 'Payments roadmap'])
    const narrowed = await find(member, { q: 'payments', modified: 'week', label: 'payments' })
    expect(titles(narrowed)).toEqual(['Payments roadmap'])
    expect(narrowed.relaxed).toEqual({ modified: 2, label: 2 })
  })

  it('lists everything visible by date when there is no query, in pages', async () => {
    const first = await find(member, { limit: '2' })
    expect(first.total).toBe(4)
    expect(titles(first)[0]).toBe('Onboarding guide')
    expect(first.nextCursor).not.toBeNull()
    const second = await find(member, { limit: '2', cursor: first.nextCursor! })
    expect(second.results).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...titles(first), ...titles(second)]).size).toBe(4)
  })

  it('rejects bad parameters', async () => {
    expect((await member.get('/api/search?limit=0')).status).toBe(400)
    expect((await member.get('/api/search?cursor=bm9wZQ')).status).toBe(400)
    expect((await member.get('/api/search?type=video')).status).toBe(400)
  })
})

describe('quick search', () => {
  it('matches titles and spaces, prefix first, including the person’s own drafts', async () => {
    const res = (await (await owner.get('/api/search/quick?q=pay')).json()) as QuickSearchDto
    expect(res.pages[0].title.startsWith('Payments')).toBe(true)
    expect(res.pages.map((p) => p.title)).toContain('Payments draft')
    const theirs = (await (await member.get('/api/search/quick?q=pay')).json()) as QuickSearchDto
    expect(theirs.pages.map((p) => p.title).sort()).toEqual(['Old payments spec', 'Payments roadmap'])
    const spaces = (await (await member.get('/api/search/quick?q=op')).json()) as QuickSearchDto
    expect(spaces.spaces).toEqual([{ key: 'OPS', name: 'Operations', icon: '📁' }])
    expect(await (await member.get('/api/search/quick?q=%20')).json()).toEqual({ pages: [], spaces: [] })
  })
})
