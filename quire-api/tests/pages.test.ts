import { MEMBERS_GROUP_ID, type DraftDto, type PageDto, type PageNodeDto, type PageRestrictionsDto, type PageVersionDetailDto, type PageVersionDto, type UserDto } from '@quire/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { signedIn, testApp, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'

type Person = Client & { user: { id: string } }

let app: ReturnType<typeof testApp>
let owner: Person
let member: Person
let reader: Person

const body = async <T>(res: Response) => (await res.json()) as T
const db = () => testDb().db

beforeEach(async () => {
  app = testApp()
  await db()
    .insert(t.groups)
    .values([
      { id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true },
      { id: 'g.readers', name: 'Readers' },
    ])
  owner = await signedIn(app, { name: 'Olive Owner' })
  member = await signedIn(app, { name: 'Max Member' })
  reader = await signedIn(app, { name: 'Rita Reader' })
  expect((await owner.post('/api/spaces', { key: 'ENG', name: 'Engineering' })).status).toBe(201)
  expect((await owner.post('/api/spaces', { key: 'OPS', name: 'Operations' })).status).toBe(201)
  await owner.put('/api/spaces/ENG/permissions', {
    grants: [
      { principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: ['View', 'Add', 'Edit', 'Comment'] },
      { principalType: 'user', principalId: reader.user.id, perms: ['View'] },
    ],
  })
  // The reader is in the members group too; tests that need a view-only person replace the grants.
})

async function create(who: Person, over: Record<string, unknown> = {}) {
  const res = await who.post('/api/pages', { spaceKey: 'ENG', title: 'Plan', html: '<p>Draft body</p>', ...over })
  expect(res.status).toBe(201)
  return body<PageDto>(res)
}

async function publish(who: Person, page: { id: string; lockVersion: number }, comment = '') {
  return who.post(`/api/pages/${page.id}/publish`, { comment }, { 'if-match': `"${page.lockVersion}"` })
}

async function published(who: Person = owner, over: Record<string, unknown> = {}) {
  const page = await create(who, over)
  const res = await publish(who, page)
  expect(res.status).toBe(200)
  return body<PageDto>(res)
}

describe('creating pages', () => {
  it('starts as a private draft with a sanitized body', async () => {
    const res = await owner.post('/api/pages', { spaceKey: 'eng', title: 'Plan', html: '<p>Hi<script>x()</script></p>' })
    expect(res.status).toBe(201)
    const page = await body<PageDto>(res)
    expect(res.headers.get('etag')).toBe('"0"')
    expect(page).toMatchObject({ status: 'draft', spaceKey: 'ENG', publishedHtml: null, ownerId: owner.user.id, draft: { html: '<p>Hi</p>', rev: 1 } })
    expect(page.myAccess).toEqual({ view: true, edit: true, comment: true, addChild: true, delete: true, restrict: true })
    expect((await member.get(`/api/pages/${page.id}`)).status).toBe(403)
    expect(await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree'))).toEqual([])
    expect((await body<PageNodeDto[]>(await owner.get('/api/spaces/ENG/tree'))).map((n) => n.id)).toEqual([page.id])
  })

  it('checks where the page goes', async () => {
    const parent = await published()
    const ops = await body<PageDto>(await owner.post('/api/pages', { spaceKey: 'OPS', title: 'Ops' }))
    expect(await (await owner.post('/api/pages', { spaceKey: 'ENG', parentId: ops.id })).json()).toMatchObject({ code: 'cross_space' })
    expect((await owner.post('/api/pages', { spaceKey: 'ENG', parentId: 'pg.nope' })).status).toBe(404)
    expect((await owner.post('/api/pages', { spaceKey: 'NOPE' })).status).toBe(404)
    const draft = await create(owner)
    expect(await (await member.post('/api/pages', { spaceKey: 'ENG', parentId: draft.id })).json()).toMatchObject({ code: 'invalid_parent' })
    expect((await reader.post('/api/pages', { spaceKey: 'ENG' })).status).toBe(201)
    await owner.put('/api/spaces/ENG/permissions', { grants: [{ principalType: 'user', principalId: reader.user.id, perms: ['View'] }] })
    expect((await reader.post('/api/pages', { spaceKey: 'ENG' })).status).toBe(403)
    expect((await reader.post('/api/pages', { spaceKey: 'ENG', parentId: parent.id })).status).toBe(403)
    await owner.post(`/api/pages/${parent.id}/archive`)
    expect(await (await owner.post('/api/pages', { spaceKey: 'ENG', parentId: parent.id })).json()).toMatchObject({ code: 'invalid_parent' })
  })

  it('places children under their parent in order', async () => {
    const parent = await published()
    const a = await published(owner, { parentId: parent.id, title: 'A' })
    const b = await published(owner, { parentId: parent.id, title: 'B' })
    const roots = await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree'))
    expect(roots).toEqual([expect.objectContaining({ id: parent.id, hasChildren: true, hasDraft: false, restricted: false })])
    const kids = await body<PageNodeDto[]>(await member.get(`/api/spaces/ENG/tree?parentId=${parent.id}`))
    expect(kids.map((k) => [k.title, k.hasChildren])).toEqual([
      ['A', false],
      ['B', false],
    ])
    const child = await body<PageDto>(await member.get(`/api/pages/${b.id}`))
    expect(child.ancestors).toEqual([{ id: parent.id, title: 'Plan' }])
    expect(child.draft).toBeNull()
    expect(a.parentId).toBe(parent.id)
  })
})

describe('drafts and publishing', () => {
  it('saves drafts against the rev the client saw', async () => {
    const page = await published()
    expect(page.draft).toBeNull()
    const first = await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>v2</p>' })
    expect(first.status).toBe(200)
    expect(await body<DraftDto>(first)).toMatchObject({ html: '<p>v2</p>', rev: 1 })
    // A second editor who never saw rev 1 is told about it.
    const blind = await member.put(`/api/pages/${page.id}/draft`, { html: '<p>mine</p>' })
    expect(blind.status).toBe(409)
    expect(await blind.json()).toMatchObject({ code: 'draft_conflict', current: { html: '<p>v2</p>', rev: 1 } })
    expect(await body<DraftDto>(await member.put(`/api/pages/${page.id}/draft`, { html: '<p>v3</p>' }, { 'if-match': '"1"' }))).toMatchObject({ rev: 2 })
    expect((await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>stale</p>' }, { 'if-match': '1' })).status).toBe(409)
    expect((await owner.put(`/api/pages/${page.id}/draft`, { html: 'x' }, { 'if-match': 'banana' })).status).toBe(400)
    const tree = await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree'))
    expect(tree[0].hasDraft).toBe(true)
  })

  it('publishes a new version and clears the draft', async () => {
    const page = await create(owner)
    expect((await owner.post(`/api/pages/${page.id}/publish`, {})).status).toBe(428)
    const res = await publish(owner, page, 'First cut')
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe('"1"')
    const after = await body<PageDto>(res)
    expect(after).toMatchObject({ status: 'published', publishedHtml: '<p>Draft body</p>', publishedVersion: 1, lockVersion: 1, wordCount: 2, draft: null })
    expect((await publish(owner, after)).status).toBe(400)
    const space = await db().select().from(t.spaces).where(eq(t.spaces.key, 'ENG'))
    expect(space[0].lastActivityAt.getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  it('lets only one of two concurrent publishes win', async () => {
    const page = await published()
    await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>owner edit</p>' })
    const [a, b] = await Promise.all([publish(owner, page), publish(member, page)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toMatchObject({ code: 'page_conflict', current: { lockVersion: 2, publishedVersion: 2 } })
  })

  it('keeps a draft saved while publishing', async () => {
    const page = await published()
    const saved = await body<DraftDto>(await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>one</p>' }))
    await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>two</p>' }, { 'if-match': `${saved.rev}` })
    // Publish runs with rev 2 loaded; nothing newer, so the draft goes.
    expect((await body<PageDto>(await publish(owner, page))).draft).toBeNull()
  })

  it('discards a draft only for published pages', async () => {
    const draftOnly = await create(owner)
    expect(await (await owner.delete(`/api/pages/${draftOnly.id}/draft`)).json()).toMatchObject({ code: 'unpublished' })
    const page = await published()
    await owner.put(`/api/pages/${page.id}/draft`, { html: '<p>scrap</p>' })
    expect((await owner.delete(`/api/pages/${page.id}/draft`)).status).toBe(204)
    expect((await body<PageDto>(await owner.get(`/api/pages/${page.id}`))).draft).toBeNull()
  })

  it('keeps read-only people out of edits', async () => {
    const page = await published()
    await owner.put('/api/spaces/ENG/permissions', { grants: [{ principalType: 'user', principalId: reader.user.id, perms: ['View'] }] })
    const seen = await body<PageDto>(await reader.get(`/api/pages/${page.id}`))
    expect(seen.myAccess).toMatchObject({ view: true, edit: false })
    expect((await reader.put(`/api/pages/${page.id}/draft`, { html: 'x' })).status).toBe(403)
    expect((await publish(reader, page)).status).toBe(403)
    expect((await reader.patch(`/api/pages/${page.id}`, { title: 'x' })).status).toBe(403)
    expect((await reader.post(`/api/pages/${page.id}/move`, { parentId: null })).status).toBe(403)
    expect((await reader.post(`/api/pages/${page.id}/archive`)).status).toBe(403)
    expect((await reader.put(`/api/pages/${page.id}/restrictions`, { view: [], edit: [] })).status).toBe(403)
    expect((await reader.put(`/api/pages/${page.id}/collaborators`, { userIds: [] })).status).toBe(403)
    expect((await reader.post(`/api/pages/${page.id}/versions/1/restore`, {}, { 'if-match': '1' })).status).toBe(403)
    expect((await reader.delete(`/api/pages/${page.id}/draft`)).status).toBe(403)
  })
})

describe('metadata and versions', () => {
  it('renames with an optional If-Match', async () => {
    const page = await published()
    const renamed = await body<PageDto>(await member.patch(`/api/pages/${page.id}`, { title: 'Roadmap', widthMode: 'wide' }))
    expect(renamed).toMatchObject({ title: 'Roadmap', widthMode: 'wide', lockVersion: 2, updatedById: member.user.id })
    const stale = await owner.patch(`/api/pages/${page.id}`, { icon: '🚀' }, { 'if-match': `"${page.lockVersion}"` })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'page_conflict', current: { title: 'Roadmap' } })
    expect((await owner.patch(`/api/pages/${page.id}`, { icon: '🚀' }, { 'if-match': '2' })).status).toBe(200)
    expect((await owner.patch(`/api/pages/${page.id}`, {})).status).toBe(400)
  })

  it('lists, shows and restores versions', async () => {
    const v1 = await published()
    await owner.put(`/api/pages/${v1.id}/draft`, { html: '<p>Second</p>' })
    const v2 = await body<PageDto>(await publish(owner, v1, 'More'))
    const list = await body<PageVersionDto[]>(await member.get(`/api/pages/${v1.id}/versions`))
    expect(list.map((v) => [v.version, v.comment])).toEqual([
      [2, 'More'],
      [1, ''],
    ])
    expect(await body<PageVersionDetailDto>(await member.get(`/api/pages/${v1.id}/versions/1`))).toMatchObject({ html: '<p>Draft body</p>', title: 'Plan' })
    expect((await member.get(`/api/pages/${v1.id}/versions/9`)).status).toBe(404)
    expect((await member.get(`/api/pages/${v1.id}/versions/latest`)).status).toBe(404)

    expect((await member.post(`/api/pages/${v1.id}/versions/1/restore`, {})).status).toBe(428)
    expect((await member.post(`/api/pages/${v1.id}/versions/1/restore`, {}, { 'if-match': '1' })).status).toBe(409)
    const restored = await body<PageDto>(await member.post(`/api/pages/${v1.id}/versions/1/restore`, {}, { 'if-match': `${v2.lockVersion}` }))
    expect(restored).toMatchObject({ publishedHtml: '<p>Draft body</p>', publishedVersion: 3 })
    expect((await body<PageVersionDto[]>(await member.get(`/api/pages/${v1.id}/versions`)))[0].comment).toBe('Restored version 1')
    expect((await member.post(`/api/pages/${v1.id}/versions/7/restore`, {}, { 'if-match': '3' })).status).toBe(404)

    await db().insert(t.pageVersions).values({ pageId: v1.id, version: 99, html: null, title: 'Imported', authorId: owner.user.id })
    expect(await (await member.post(`/api/pages/${v1.id}/versions/99/restore`, {}, { 'if-match': '3' })).json()).toMatchObject({ code: 'version_unavailable' })
  })
})

describe('moving and copying', () => {
  it('reorders siblings and reparents', async () => {
    const [a, b, c] = [await published(owner, { title: 'A' }), await published(owner, { title: 'B' }), await published(owner, { title: 'C' })]
    const titles = async (parentId = '') => (await body<PageNodeDto[]>(await owner.get(`/api/spaces/ENG/tree?parentId=${parentId}`))).map((n) => n.title)
    await member.post(`/api/pages/${c.id}/move`, { parentId: null, index: 0 })
    expect(await titles()).toEqual(['C', 'A', 'B'])
    await member.post(`/api/pages/${c.id}/move`, { parentId: null, index: 2 })
    expect(await titles()).toEqual(['A', 'B', 'C'])
    await member.post(`/api/pages/${a.id}/move`, { parentId: null, index: 1 })
    expect(await titles()).toEqual(['B', 'A', 'C'])
    const moved = await body<PageDto>(await member.post(`/api/pages/${c.id}/move`, { parentId: b.id }))
    expect(moved).toMatchObject({ parentId: b.id, ancestors: [{ id: b.id, title: 'B' }] })
    expect(await titles(b.id)).toEqual(['C'])
  })

  it('rejects cycles, other spaces and trashed pages', async () => {
    const root = await published(owner, { title: 'Root' })
    const child = await published(owner, { title: 'Child', parentId: root.id })
    expect(await (await owner.post(`/api/pages/${root.id}/move`, { parentId: child.id })).json()).toMatchObject({ code: 'move_cycle' })
    expect(await (await owner.post(`/api/pages/${root.id}/move`, { parentId: root.id })).json()).toMatchObject({ code: 'move_cycle' })
    const ops = await body<PageDto>(await owner.post('/api/pages', { spaceKey: 'OPS', title: 'Ops' }))
    expect(await (await owner.post(`/api/pages/${root.id}/move`, { parentId: ops.id })).json()).toMatchObject({ code: 'cross_space' })
    await owner.post(`/api/pages/${child.id}/archive`)
    expect(await (await owner.post(`/api/pages/${child.id}/move`, { parentId: null })).json()).toMatchObject({ code: 'in_trash' })
  })

  it('copies next to the original as a new draft', async () => {
    const a = await published(owner, { title: 'A' })
    await published(owner, { title: 'B' })
    await owner.put(`/api/pages/${a.id}/draft`, { html: '<p>unpublished</p>' })
    const copy = await body<PageDto>(await member.post(`/api/pages/${a.id}/copy`))
    expect(copy).toMatchObject({ title: 'Copy of A', status: 'draft', ownerId: member.user.id, draft: { html: '<p>unpublished</p>' } })
    expect((await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree'))).map((n) => n.title)).toEqual(['A', 'Copy of A', 'B'])
    // Without edit rights the copy starts from the published body.
    await owner.put('/api/spaces/ENG/permissions', { grants: [{ principalType: 'user', principalId: reader.user.id, perms: ['View', 'Add'] }] })
    const named = await body<PageDto>(await reader.post(`/api/pages/${a.id}/copy`, { title: 'Mine' }))
    expect(named).toMatchObject({ title: 'Mine', draft: null })
    expect(named.status).toBe('draft')
    // Drafts are private to their author, space owner included.
    expect((await owner.get(`/api/pages/${named.id}`)).status).toBe(403)
  })
})

describe('trash', () => {
  it('archives, deletes and restores whole subtrees', async () => {
    const root = await published(owner, { title: 'Root' })
    const child = await published(owner, { title: 'Child', parentId: root.id })
    const draft = await create(owner, { title: 'Draft child', parentId: root.id })
    expect((await member.post(`/api/pages/${root.id}/archive`)).status).toBe(403)
    const archived = await body<PageDto>(await owner.post(`/api/pages/${root.id}/archive`))
    expect(archived.status).toBe('archived')
    expect((await member.get(`/api/pages/${child.id}`)).status).toBe(403)
    expect(await body<PageNodeDto[]>(await owner.get('/api/spaces/ENG/tree'))).toEqual([])
    expect((await body<PageNodeDto[]>(await owner.get('/api/spaces/ENG/tree?trash=1'))).map((n) => n.title)).toEqual(['Root'])
    expect(await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree?trash=1'))).toEqual([])
    expect(await (await owner.post(`/api/pages/${root.id}/archive`)).json()).toMatchObject({ code: 'in_trash' })

    expect((await owner.post(`/api/pages/${root.id}/delete`)).status).toBe(200)
    expect(await (await owner.post(`/api/pages/${root.id}/delete`)).json()).toMatchObject({ code: 'in_trash' })
    const rows = await db().select({ id: t.pages.id, status: t.pages.status, before: t.pages.statusBeforeTrash }).from(t.pages)
    expect(rows.every((r) => r.status === 'deleted')).toBe(true)

    await owner.post(`/api/pages/${root.id}/restore`)
    expect((await body<PageDto>(await owner.get(`/api/pages/${child.id}`))).status).toBe('published')
    expect((await body<PageDto>(await owner.get(`/api/pages/${draft.id}`))).status).toBe('draft')
    expect(await (await owner.post(`/api/pages/${root.id}/restore`)).json()).toMatchObject({ code: 'not_in_trash' })
  })

  it('restores a child of a trashed page to the top level', async () => {
    const root = await published(owner, { title: 'Root' })
    const child = await published(owner, { title: 'Child', parentId: root.id })
    await owner.post(`/api/pages/${root.id}/archive`)
    const restored = await body<PageDto>(await owner.post(`/api/pages/${child.id}/restore`))
    expect(restored).toMatchObject({ status: 'published', parentId: null })
    expect((await body<PageNodeDto[]>(await owner.get('/api/spaces/ENG/tree?trash=1'))).map((n) => n.title)).toEqual(['Root'])
  })

  it('lets people trash their own pages without the Delete permission', async () => {
    const page = await published(member)
    expect((await member.post(`/api/pages/${page.id}/delete`)).status).toBe(200)
    // …and can undo it from the trash.
    expect(await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree?trash=1'))).toHaveLength(1)
    expect((await body<PageDto>(await member.post(`/api/pages/${page.id}/restore`))).status).toBe('published')
  })
})

describe('restrictions', () => {
  it('limits viewing, inherited by children, and keeps the setter on the list', async () => {
    const root = await published(owner, { title: 'Root' })
    const child = await published(owner, { title: 'Child', parentId: root.id })
    const res = await owner.put(`/api/pages/${root.id}/restrictions`, { view: [{ type: 'group', id: 'g.readers' }], edit: [] })
    expect(await body<PageRestrictionsDto>(res)).toEqual({
      view: [
        { type: 'group', id: 'g.readers', name: 'Readers' },
        { type: 'user', id: owner.user.id, name: 'Olive Owner' },
      ],
      edit: [],
      inherited: [],
    })
    expect((await member.get(`/api/pages/${child.id}`)).status).toBe(403)
    expect(await body<PageNodeDto[]>(await member.get('/api/spaces/ENG/tree'))).toEqual([])
    const ownerTree = await body<PageNodeDto[]>(await owner.get('/api/spaces/ENG/tree'))
    expect(ownerTree[0]).toMatchObject({ restricted: true, hasChildren: true })

    await db().insert(t.groupMembers).values({ groupId: 'g.readers', userId: member.user.id })
    expect((await member.get(`/api/pages/${child.id}`)).status).toBe(200)
    const inherited = await body<PageRestrictionsDto>(await member.get(`/api/pages/${child.id}/restrictions`))
    expect(inherited.inherited).toEqual([{ pageId: root.id, title: 'Root', view: expect.arrayContaining([expect.objectContaining({ id: 'g.readers' })]) }])
  })

  it('limits editing to the page itself', async () => {
    const root = await published(owner, { title: 'Root' })
    const child = await published(owner, { title: 'Child', parentId: root.id })
    await owner.put(`/api/pages/${root.id}/restrictions`, { view: [], edit: [{ type: 'user', id: owner.user.id }] })
    expect((await body<PageDto>(await member.get(`/api/pages/${root.id}`))).myAccess).toMatchObject({ view: true, edit: false, comment: true })
    expect((await body<PageDto>(await member.get(`/api/pages/${child.id}`))).myAccess.edit).toBe(true)
    expect((await member.put(`/api/pages/${root.id}/draft`, { html: 'x' })).status).toBe(403)
    expect((await member.post('/api/pages', { spaceKey: 'ENG', parentId: root.id })).status).toBe(403)
  })

  it('rejects unknown principals and shows stale ones by id', async () => {
    const page = await published()
    expect(await (await owner.put(`/api/pages/${page.id}/restrictions`, { view: [{ type: 'group', id: 'g.nope' }], edit: [] })).json()).toMatchObject({
      code: 'unknown_principal',
    })
    await db()
      .insert(t.pageRestrictions)
      .values([
        { pageId: page.id, kind: 'edit', principalType: 'group', principalId: 'g.gone' },
        { pageId: page.id, kind: 'edit', principalType: 'user', principalId: owner.user.id },
      ])
    expect((await body<PageRestrictionsDto>(await owner.get(`/api/pages/${page.id}/restrictions`))).edit).toEqual([
      { type: 'group', id: 'g.gone', name: 'g.gone' },
      { type: 'user', id: owner.user.id, name: 'Olive Owner' },
    ])
    const cleared = await body<PageRestrictionsDto>(await owner.put(`/api/pages/${page.id}/restrictions`, { view: [], edit: [] }))
    expect(cleared).toEqual({ view: [], edit: [], inherited: [] })
  })
})

describe('collaborators, stars and watches', () => {
  it('shares a draft with collaborators', async () => {
    const draft = await create(owner)
    const res = await owner.put(`/api/pages/${draft.id}/collaborators`, { userIds: [member.user.id, member.user.id] })
    expect((await body<UserDto[]>(res)).map((u) => u.id)).toEqual([member.user.id])
    expect((await member.get(`/api/pages/${draft.id}`)).status).toBe(200)
    expect((await body<UserDto[]>(await member.get(`/api/pages/${draft.id}/collaborators`))).length).toBe(1)
    expect(await (await owner.put(`/api/pages/${draft.id}/collaborators`, { userIds: ['u.nope'] })).json()).toMatchObject({ code: 'unknown_user' })
    await owner.put(`/api/pages/${draft.id}/collaborators`, { userIds: [] })
    expect((await member.get(`/api/pages/${draft.id}`)).status).toBe(403)
  })

  it('stars and watches pages the person can see', async () => {
    const page = await published()
    expect((await member.put(`/api/pages/${page.id}/star`)).status).toBe(204)
    expect((await member.put(`/api/pages/${page.id}/watch`)).status).toBe(204)
    expect(await body<PageDto>(await member.get(`/api/pages/${page.id}`))).toMatchObject({ starred: true, watched: true })
    expect((await member.delete(`/api/pages/${page.id}/star`)).status).toBe(204)
    expect((await body<PageDto>(await member.get(`/api/pages/${page.id}`))).starred).toBe(false)
    const draft = await create(owner)
    expect((await member.put(`/api/pages/${draft.id}/star`)).status).toBe(403)
    expect((await member.get('/api/pages/pg.nope')).status).toBe(404)
  })
})
