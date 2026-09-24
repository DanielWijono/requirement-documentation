import { evaluatePageAccess, evaluateSpaceAccess, MEMBER_DEFAULT_PERMS, MEMBERS_GROUP_ID, subjectOf, type Subject } from '@quire/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { loadPageFacts, loadSpaceFacts, loadSubject, pageForSubject, spaceForSubject, visiblePagesSql, visibleSpacesSql } from '../src/services/access.ts'
import { testDb } from './helpers/db.ts'
import { makePage, makeSpace, makeUser } from './helpers/factories.ts'

const db = () => testDb().db

/**
 * Space OPEN: members group defaults, g.design may view, u.cleaner holds Delete.
 * Space CLOSED: only its owner and g.design.
 * Pages in OPEN: root → child → grandchild with a view list on root and one on child,
 * plus a draft, a draft with a collaborator, an archived page and an edit-restricted page.
 */
async function fixture() {
  const [owner, member, designer, cleaner, admin] = [
    await makeUser(db(), { id: 'u.owner' }),
    await makeUser(db(), { id: 'u.member' }),
    await makeUser(db(), { id: 'u.designer' }),
    await makeUser(db(), { id: 'u.cleaner' }),
    await makeUser(db(), { id: 'u.admin', siteRole: 'admin' }),
  ]
  await db().insert(t.groups).values([
    { id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true },
    { id: 'g.design', name: 'Design' },
  ])
  await db().insert(t.groupMembers).values({ groupId: 'g.design', userId: designer.id })

  const open = await makeSpace(db(), { id: 'sp.open', key: 'OPEN', ownerId: owner.id })
  const closed = await makeSpace(db(), { id: 'sp.closed', key: 'CLOSED', ownerId: owner.id })
  await db()
    .insert(t.spacePermissions)
    .values([
      { spaceId: open.id, principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: [...MEMBER_DEFAULT_PERMS] },
      { spaceId: open.id, principalType: 'user', principalId: cleaner.id, perms: ['View', 'Delete'] },
      { spaceId: closed.id, principalType: 'group', principalId: 'g.design', perms: ['View'] },
    ])

  const page = (id: string, over: Partial<typeof t.pages.$inferInsert> = {}) =>
    makePage(db(), { id, spaceId: open.id, ownerId: owner.id, status: 'published', ...over })
  const root = await page('pg.root')
  const child = await page('pg.child', { parentId: root.id })
  const grandchild = await page('pg.grandchild', { parentId: child.id })
  await page('pg.plain')
  await page('pg.draft', { status: 'draft' })
  await page('pg.shared-draft', { status: 'draft' })
  await page('pg.archived', { status: 'archived' })
  await page('pg.my-archived', { status: 'archived', ownerId: member.id })
  await page('pg.locked')
  await makePage(db(), { id: 'pg.closed', spaceId: closed.id, ownerId: owner.id, status: 'published' })
  await db()
    .insert(t.pageRestrictions)
    .values([
      { pageId: root.id, kind: 'view', principalType: 'user', principalId: member.id },
      { pageId: root.id, kind: 'view', principalType: 'group', principalId: 'g.design' },
      { pageId: child.id, kind: 'view', principalType: 'user', principalId: member.id },
      { pageId: child.id, kind: 'edit', principalType: 'user', principalId: owner.id },
      { pageId: 'pg.locked', kind: 'edit', principalType: 'group', principalId: 'g.design' },
    ])
  await db().insert(t.pageCollaborators).values({ pageId: 'pg.shared-draft', userId: member.id })
  return { owner, member, designer, cleaner, admin, grandchild }
}

let f: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  f = await fixture()
})

const subjectFor = (u: { id: string; siteRole: 'admin' | 'member' }) => loadSubject(db(), { id: u.id, siteRole: u.siteRole })

describe('loading facts', () => {
  it('finds the subject’s groups', async () => {
    expect([...(await subjectFor(f.designer)).groupIds].sort()).toEqual([MEMBERS_GROUP_ID, 'g.design'].sort())
    expect((await subjectFor(f.member)).groupIds).toEqual([MEMBERS_GROUP_ID])
  })

  it('collects view lists up the ancestor chain but only the page’s own edit list', async () => {
    const facts = await loadPageFacts(db(), f.grandchild)
    expect(facts.viewLists).toHaveLength(2)
    expect(facts.editList).toEqual([])
    const child = await pageForSubject(db(), await subjectFor(f.member), 'pg.child')
    expect(child.access.edit).toBe(false)
  })

  it('returns 404 for missing pages and hidden spaces, 403 for restricted pages', async () => {
    const member = await subjectFor(f.member)
    await expect(pageForSubject(db(), member, 'pg.nope')).rejects.toMatchObject({ status: 404 })
    await expect(pageForSubject(db(), member, 'pg.closed')).rejects.toMatchObject({ status: 404 })
    await expect(pageForSubject(db(), await subjectFor(f.designer), 'pg.grandchild')).rejects.toMatchObject({ status: 403 })
    await expect(spaceForSubject(db(), member, 'closed')).rejects.toMatchObject({ status: 404 })
    await expect(spaceForSubject(db(), member, 'NOPE')).rejects.toMatchObject({ status: 404 })
    expect((await spaceForSubject(db(), member, 'open')).access.admin).toBe(false)
  })
})

describe('SQL filters agree with evaluateAccess', () => {
  async function expected(subject: Subject) {
    const spaces = await db().select().from(t.spaces)
    const pages = await db().select().from(t.pages)
    const spaceFacts = new Map(await Promise.all(spaces.map(async (s) => [s.id, await loadSpaceFacts(db(), s)] as const)))
    const visibleSpaces = spaces.filter((s) => evaluateSpaceAccess(subject, spaceFacts.get(s.id)!).view).map((s) => s.id)
    const visiblePages: string[] = []
    for (const p of pages) if (evaluatePageAccess(subject, spaceFacts.get(p.spaceId)!, await loadPageFacts(db(), p)).view) visiblePages.push(p.id)
    return { spaces: visibleSpaces.sort(), pages: visiblePages.sort() }
  }

  async function actual(subject: Subject) {
    const spaces = await db().select({ id: t.spaces.id }).from(t.spaces).where(visibleSpacesSql(subject))
    const pages = await db().select({ id: t.pages.id }).from(t.pages).where(visiblePagesSql(subject))
    return { spaces: spaces.map((s) => s.id).sort(), pages: pages.map((p) => p.id).sort() }
  }

  it.each(['owner', 'member', 'designer', 'cleaner', 'admin', 'outsider'] as const)('for %s', async (who) => {
    const subject = who === 'outsider' ? subjectOf('u.nobody', 'member') : await subjectFor(f[who])
    const want = await expected(subject)
    expect(await actual(subject)).toEqual(want)
    // Spot-check the fixture exercises what it claims to.
    if (who === 'member') expect(want.pages).toEqual(['pg.child', 'pg.grandchild', 'pg.locked', 'pg.my-archived', 'pg.plain', 'pg.root', 'pg.shared-draft'])
    if (who === 'designer') expect(want.pages).toEqual(['pg.closed', 'pg.locked', 'pg.plain', 'pg.root'])
    if (who === 'cleaner') expect(want.pages).toEqual(['pg.archived', 'pg.locked', 'pg.my-archived', 'pg.plain'])
  })
})
