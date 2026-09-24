import { describe, expect, it } from 'vitest'
import {
  MEMBERS_GROUP_ID,
  type CommentDto,
  type DraftDto,
  type InviteLookupDto,
  type LabelCountDto,
  type PageDto,
  type PageItemDto,
  type PageRestrictionsDto,
  type PageTreeDto,
  type QuickSearchDto,
  type SearchResponseDto,
  type SpaceDto,
  type SpaceGrantDto,
  type StarredDto,
  type UserDto,
} from '../src/api.ts'

/**
 * The contract suite: behaviour both the real API and the web tests' fake backend must share.
 * Each package runs it against its own target, so the fake can't drift from the API.
 * Every route family added to the fake gets cases here.
 */

export interface ContractResponse {
  status: number
  json(): Promise<unknown>
}

/** One independent browser: its own cookies. */
export interface ContractClient {
  get(path: string, headers?: Record<string, string>): Promise<ContractResponse>
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<ContractResponse>
  put(path: string, body?: unknown, headers?: Record<string, string>): Promise<ContractResponse>
  patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<ContractResponse>
  delete(path: string, headers?: Record<string, string>): Promise<ContractResponse>
}

export interface ContractTarget {
  newClient(): ContractClient
  /** A site admin who can already sign in. */
  admin: { email: string; password: string }
  /** The text of the latest email sent to `to`. */
  lastMailTo(to: string): Promise<string>
}

async function signedIn(target: ContractTarget, email: string, password: string) {
  const c = target.newClient()
  const res = await c.post('/api/auth/sign-in/email', { email, password })
  expect(res.status).toBe(200)
  return c
}

const unique = () => Math.random().toString(36).slice(2, 8)

/** A new member, invited by the admin and signed in. */
async function newMember(t: ContractTarget) {
  const admin = await signedIn(t, t.admin.email, t.admin.password)
  const email = `m-${unique()}@example.com`
  expect((await admin.post('/api/invites', { email })).status).toBe(201)
  const token = /\/invite\/([\w-]+)/.exec(await t.lastMailTo(email))?.[1]
  const member = t.newClient()
  expect((await member.post(`/api/invites/${token}/accept`, { name: 'Mo Member', password: 'long enough password' })).status).toBe(201)
  const me = (await (await member.get('/api/me')).json()) as UserDto
  return Object.assign(member, { id: me.id })
}

const json = async <T>(res: ContractResponse) => (await res.json()) as T

export function spacesContract(target: () => ContractTarget) {
  describe('contract: spaces', () => {
    async function setup() {
      const t = target()
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      const key = `C${unique().replace(/[^a-z]/g, 'x').toUpperCase().slice(0, 5)}`
      const res = await admin.post('/api/spaces', { key: key.toLowerCase(), name: 'Contract space' })
      expect(res.status).toBe(201)
      return { t, admin, key, space: await json<SpaceDto>(res) }
    }

    it('creates a space the creator owns, found by key or id', async () => {
      const { admin, key, space } = await setup()
      expect(space).toMatchObject({ key, name: 'Contract space', icon: '📁', description: '', archived: false, starred: false, watched: false })
      expect(space.myPermissions).toEqual(['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin'])
      expect((await admin.post('/api/spaces', { key, name: 'Again' })).status).toBe(409)
      expect((await admin.post('/api/spaces', { key: '1BAD', name: 'Bad' })).status).toBe(400)
      expect((await json<SpaceDto[]>(await admin.get('/api/spaces'))).map((s) => s.key)).toContain(key)
      expect((await json<SpaceDto>(await admin.get(`/api/spaces/${space.id}`))).key).toBe(key)
      expect((await admin.get('/api/spaces/NOPE9')).status).toBe(404)
    })

    it('stars, watches, renames, archives and deletes', async () => {
      const { admin, key, space } = await setup()
      expect((await admin.put(`/api/spaces/${key}/star`)).status).toBe(204)
      expect((await admin.put(`/api/spaces/${key}/watch`)).status).toBe(204)
      expect(await json<SpaceDto>(await admin.get(`/api/spaces/${key}`))).toMatchObject({ starred: true, watched: true })
      expect((await admin.delete(`/api/spaces/${key}/star`)).status).toBe(204)
      expect((await json<SpaceDto>(await admin.get(`/api/spaces/${key}`))).starred).toBe(false)

      const renamed = await json<SpaceDto>(await admin.patch(`/api/spaces/${space.id}`, { name: 'Renamed', key: `${key}Z` }))
      expect(renamed).toMatchObject({ id: space.id, name: 'Renamed', key: `${key}Z` })
      expect((await admin.patch(`/api/spaces/${space.id}`, {})).status).toBe(400)
      expect((await json<SpaceDto>(await admin.post(`/api/spaces/${space.id}/archive`))).archived).toBe(true)
      expect((await json<SpaceDto>(await admin.post(`/api/spaces/${space.id}/unarchive`))).archived).toBe(false)
      expect((await admin.delete(`/api/spaces/${space.id}`)).status).toBe(204)
      expect((await admin.get(`/api/spaces/${space.id}`)).status).toBe(404)
    })

    it('follows the permission matrix', async () => {
      const { t, admin, key } = await setup()
      const member = await newMember(t)
      expect((await json<SpaceDto>(await member.get(`/api/spaces/${key}`))).myPermissions).toEqual(['View', 'Add', 'Edit', 'Comment'])
      expect((await member.patch(`/api/spaces/${key}`, { name: 'Mine now' })).status).toBe(403)
      expect((await member.get(`/api/spaces/${key}/permissions`)).status).toBe(403)

      const grants = await json<SpaceGrantDto[]>(await admin.put(`/api/spaces/${key}/permissions`, { grants: [{ principalType: 'user', principalId: member.id, perms: ['Comment', 'View'] }] }))
      expect(grants).toEqual([{ principalType: 'user', principalId: member.id, name: 'Mo Member', perms: ['View', 'Comment'] }])
      expect((await json<SpaceDto>(await member.get(`/api/spaces/${key}`))).myPermissions).toEqual(['View', 'Comment'])

      await admin.put(`/api/spaces/${key}/permissions`, { grants: [] })
      expect((await member.get(`/api/spaces/${key}`)).status).toBe(404)
      expect((await json<SpaceDto[]>(await member.get('/api/spaces'))).map((s) => s.key)).not.toContain(key)
      expect((await member.put(`/api/spaces/${key}/star`)).status).toBe(404)

      const bad = await admin.put(`/api/spaces/${key}/permissions`, { grants: [{ principalType: 'group', principalId: 'g.nope', perms: ['View'] }] })
      expect(bad.status).toBe(400)
      expect((await admin.put(`/api/spaces/${key}/permissions`, { grants: [{ principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: ['View'] }] })).status).toBe(200)
      expect((await json<SpaceDto>(await member.get(`/api/spaces/${key}`))).myPermissions).toEqual(['View'])
    })

    it('lists people and groups for anyone signed in', async () => {
      const { t } = await setup()
      const member = await newMember(t)
      const people = await json<UserDto[]>(await member.get('/api/users'))
      expect(people.map((u) => u.id)).toContain(member.id)
      expect((await json<{ id: string }[]>(await member.get('/api/groups'))).map((g) => g.id)).toContain(MEMBERS_GROUP_ID)
      expect((await t.newClient().get('/api/users')).status).toBe(401)
    })
  })
}

export function sessionContract(target: () => ContractTarget) {
  describe('contract: sessions', () => {
    it('answers 401 without a session', async () => {
      const res = await target().newClient().get('/api/me')
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 'unauthenticated' })
    })

    it('rejects a wrong password and signs in with the right one', async () => {
      const t = target()
      expect((await t.newClient().post('/api/auth/sign-in/email', { email: t.admin.email, password: 'wrong-password' })).status).toBe(401)
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      const me = (await (await admin.get('/api/me')).json()) as UserDto
      expect(me).toMatchObject({ email: t.admin.email, siteRole: 'admin', deactivated: false })
      expect(me.initials).toMatch(/^[A-Z?]{1,2}$/)
    })

    it('signs out', async () => {
      const t = target()
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      expect((await admin.post('/api/auth/sign-out')).status).toBe(200)
      expect((await admin.get('/api/me')).status).toBe(401)
    })

    it('answers a reset request the same way whether or not the account exists', async () => {
      const res = await target().newClient().post('/api/auth/request-password-reset', { email: 'nobody@example.com' })
      expect(res.status).toBe(200)
    })

    it('resets a password from the emailed link and ends other sessions', async () => {
      const t = target()
      const before = await signedIn(t, t.admin.email, t.admin.password)
      expect((await t.newClient().post('/api/auth/request-password-reset', { email: t.admin.email })).status).toBe(200)
      const token = /reset-password\?token=([^\s&]+)/.exec(await t.lastMailTo(t.admin.email))?.[1]
      expect(token).toBeTruthy()
      const guest = t.newClient()
      expect((await guest.post('/api/auth/reset-password', { newPassword: 'a brand new password', token: 'wrong' })).status).toBe(400)
      expect((await guest.post('/api/auth/reset-password', { newPassword: 'a brand new password', token: decodeURIComponent(token!) })).status).toBe(200)
      expect((await before.get('/api/me')).status).toBe(401)
      expect((await t.newClient().post('/api/auth/sign-in/email', { email: t.admin.email, password: t.admin.password })).status).toBe(401)
      await signedIn(t, t.admin.email, 'a brand new password')
    })
  })

  describe('contract: invites', () => {
    it('invite → look up → accept → signed in, once', async () => {
      const t = target()
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      const email = `new-${Math.random().toString(36).slice(2, 8)}@example.com`
      expect((await admin.post('/api/invites', { email })).status).toBe(201)
      const token = /\/invite\/([\w-]+)/.exec(await t.lastMailTo(email))?.[1]
      expect(token).toBeTruthy()

      const guest = t.newClient()
      const lookup = (await (await guest.get(`/api/invites/${token}`)).json()) as InviteLookupDto
      expect(lookup).toMatchObject({ email })
      expect((await guest.post(`/api/invites/${token}/accept`, { name: 'Nia New', password: 'short' })).status).toBe(400)
      expect((await guest.post(`/api/invites/${token}/accept`, { name: 'Nia New', password: 'long enough password' })).status).toBe(201)
      expect(await (await guest.get('/api/me')).json()).toMatchObject({ email, name: 'Nia New', initials: 'NN', siteRole: 'member' })

      expect((await t.newClient().get(`/api/invites/${token}`)).status).toBe(410)
      expect((await t.newClient().post(`/api/invites/${token}/accept`, { name: 'Again', password: 'long enough password' })).status).toBe(410)
      expect((await t.newClient().get('/api/invites/not-a-real-token')).status).toBe(404)
      // Members can't invite.
      expect((await guest.post('/api/invites', { email: 'x@example.com' })).status).toBe(403)
    })
  })
}

export function pagesContract(target: () => ContractTarget) {
  async function setup() {
    const t = target()
    const admin = await signedIn(t, t.admin.email, t.admin.password)
    const key = `P${unique().replace(/[^a-z]/g, 'x').toUpperCase().slice(0, 5)}`
    expect((await admin.post('/api/spaces', { key, name: 'Pages contract' })).status).toBe(201)
    const create = async (over: Record<string, unknown> = {}) => {
      const res = await admin.post('/api/pages', { spaceKey: key, title: 'Plan', html: '<p>Body text</p>', ...over })
      expect(res.status).toBe(201)
      return json<PageDto>(res)
    }
    const publish = async (page: PageDto) => json<PageDto>(await admin.post(`/api/pages/${page.id}/publish`, {}, { 'if-match': `"${page.lockVersion}"` }))
    return { t, admin, key, create, publish }
  }

  describe('contract: pages', () => {
    it('drafts are private; saving checks the rev; publishing checks the lock version', async () => {
      const { t, admin, create } = await setup()
      const member = await newMember(t)
      const page = await create()
      expect(page).toMatchObject({ status: 'draft', publishedVersion: 0, lockVersion: 0, draft: { rev: 1 } })
      expect((await member.get(`/api/pages/${page.id}`)).status).toBe(403)

      expect((await admin.put(`/api/pages/${page.id}/draft`, { html: '<p>no rev</p>' })).status).toBe(409)
      const saved = await json<DraftDto>(await admin.put(`/api/pages/${page.id}/draft`, { html: '<p>v2</p>' }, { 'if-match': '"1"' }))
      expect(saved.rev).toBe(2)
      expect((await admin.put(`/api/pages/${page.id}/draft`, { html: '<p>stale</p>' }, { 'if-match': '"1"' })).status).toBe(409)

      expect((await admin.post(`/api/pages/${page.id}/publish`, {})).status).toBe(428)
      const published = await json<PageDto>(await admin.post(`/api/pages/${page.id}/publish`, { comment: 'First' }, { 'if-match': '"0"' }))
      expect(published).toMatchObject({ status: 'published', publishedVersion: 1, lockVersion: 1, draft: null, publishedHtml: '<p>v2</p>' })
      expect((await member.get(`/api/pages/${page.id}`)).status).toBe(200)

      await admin.put(`/api/pages/${page.id}/draft`, { html: '<p>v3</p>' })
      const conflict = await admin.post(`/api/pages/${page.id}/publish`, {}, { 'if-match': '"0"' })
      expect(conflict.status).toBe(409)
      expect(await conflict.json()).toMatchObject({ code: 'page_conflict', current: { lockVersion: 1 } })
      expect((await json<{ version: number; comment: string }[]>(await admin.get(`/api/pages/${page.id}/versions`))).map((v) => v.comment)).toEqual(['First'])
    })

    it('builds the tree, moves pages, rejects cycles and handles the trash', async () => {
      const { admin, key, create, publish } = await setup()
      const root = await publish(await create({ title: 'Root' }))
      const child = await publish(await create({ title: 'Child', parentId: root.id }))
      const tree = await json<PageTreeDto[]>(await admin.get(`/api/spaces/${key}/tree?all=1`))
      expect(tree.map((n) => [n.title, n.children.map((c) => c.title)])).toEqual([['Root', ['Child']]])
      expect(await json<{ code: string }>(await admin.post(`/api/pages/${root.id}/move`, { parentId: child.id }))).toMatchObject({ code: 'move_cycle' })
      expect((await json<PageDto>(await admin.post(`/api/pages/${child.id}/move`, { parentId: null }))).parentId).toBeNull()

      expect((await json<PageDto>(await admin.post(`/api/pages/${root.id}/archive`))).status).toBe('archived')
      expect((await json<PageTreeDto[]>(await admin.get(`/api/spaces/${key}/tree?all=1`))).map((n) => n.title)).toEqual(['Child'])
      expect((await json<{ title: string }[]>(await admin.get(`/api/spaces/${key}/tree?trash=1`))).map((n) => n.title)).toEqual(['Root'])
      expect((await json<PageDto>(await admin.post(`/api/pages/${root.id}/restore`))).status).toBe('published')
      const copy = await json<PageDto>(await admin.post(`/api/pages/${child.id}/copy`))
      expect(copy).toMatchObject({ title: 'Copy of Child', status: 'draft' })
    })

    it('restricts viewing and editing, keeping whoever sets the list', async () => {
      const { t, admin, create, publish } = await setup()
      const member = await newMember(t)
      const page = await publish(await create())
      const set = await json<PageRestrictionsDto>(
        await admin.put(`/api/pages/${page.id}/restrictions`, { view: [{ type: 'user', id: member.id }], edit: [{ type: 'group', id: MEMBERS_GROUP_ID }] }),
      )
      expect(set.view.map((p) => p.type).sort()).toEqual(['user', 'user'])
      expect(set.edit.map((p) => p.id)).toContain(MEMBERS_GROUP_ID)
      expect((await json<PageDto>(await member.get(`/api/pages/${page.id}`))).myAccess).toMatchObject({ view: true, edit: true })
      await admin.put(`/api/pages/${page.id}/restrictions`, { view: [], edit: [] })
      await admin.put(`/api/pages/${page.id}/restrictions`, { view: [{ type: 'group', id: MEMBERS_GROUP_ID }], edit: [] })
      const other = await newMember(t)
      expect((await other.get(`/api/pages/${page.id}`)).status).toBe(200)
      await admin.put(`/api/pages/${page.id}/restrictions`, { view: [{ type: 'user', id: member.id }], edit: [] })
      expect((await other.get(`/api/pages/${page.id}`)).status).toBe(403)
    })
  })

  describe('contract: comments, labels, home and search', () => {
    it('threads comments one level deep and resolves threads', async () => {
      const { admin, create, publish } = await setup()
      const page = await publish(await create())
      const top = await json<CommentDto>(await admin.post(`/api/pages/${page.id}/comments`, { body: 'Question', anchorText: 'Body' }))
      const reply = await json<CommentDto>(await admin.post(`/api/comments/${top.id}/replies`, { body: 'Answer' }))
      const nested = await json<CommentDto>(await admin.post(`/api/comments/${reply.id}/replies`, { body: 'Thanks' }))
      expect(nested.parentId).toBe(top.id)
      expect((await json<CommentDto>(await admin.post(`/api/comments/${top.id}/resolve`))).resolved).toBe(true)
      expect((await admin.post(`/api/comments/${reply.id}/resolve`)).status).toBe(400)
      const threads = await json<CommentDto[]>(await admin.get(`/api/pages/${page.id}/comments`))
      expect(threads).toHaveLength(1)
      expect(threads[0].replies.map((r) => r.body)).toEqual(['Answer', 'Thanks'])
    })

    it('normalizes labels and lists the ones on visible pages', async () => {
      const { admin, key, create, publish } = await setup()
      const page = await publish(await create())
      expect(await json<string[]>(await admin.put(`/api/pages/${page.id}/labels`, { labels: ['On Call', 'API', 'api'] }))).toEqual(['api', 'on-call'])
      expect(await json<LabelCountDto[]>(await admin.get(`/api/labels?space=${key}`))).toEqual([
        { name: 'api', count: 1 },
        { name: 'on-call', count: 1 },
      ])
    })

    it('fills the home lists and finds published pages', async () => {
      const { admin, create, publish } = await setup()
      const title = `Zebra ${unique()}`
      const page = await publish(await create({ title, html: '<p>Striped animals of the savanna.</p>' }))
      const draft = await create({ title: `${title} draft` })

      expect((await admin.post(`/api/pages/${page.id}/views`)).status).toBe(204)
      expect((await json<PageItemDto[]>(await admin.get('/api/me/recent')))[0]).toMatchObject({ id: page.id, spaceId: page.spaceId })
      expect((await admin.put(`/api/pages/${page.id}/star`)).status).toBe(204)
      expect((await json<StarredDto>(await admin.get('/api/me/starred'))).pages.map((p) => p.id)).toContain(page.id)
      expect((await json<PageItemDto[]>(await admin.get('/api/me/drafts'))).map((p) => p.id)).toContain(draft.id)

      const found = await json<SearchResponseDto>(await admin.get(`/api/search?q=${encodeURIComponent(title)}`))
      expect(found.results.map((r) => r.id)).toEqual([page.id])
      expect(found.results[0]).toMatchObject({ spaceId: page.spaceId, title })
      const body = await json<SearchResponseDto>(await admin.get('/api/search?q=savanna'))
      expect(body.results[0].snippet.some((p) => p.match && /savanna/i.test(p.text))).toBe(true)
      const quick = await json<QuickSearchDto>(await admin.get(`/api/search/quick?q=${encodeURIComponent(title)}`))
      expect(quick.pages.map((p) => p.id).sort()).toEqual([page.id, draft.id].sort())
    })
  })
}
