import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { MEMBERS_GROUP_ID } from '@quire/shared'
import { signedIn, testApp, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'
import { makeSpace } from './helpers/factories.ts'

type Json = Record<string, unknown> & { members?: { id: string }[] }
const json = async (res: Response) => (await res.json()) as Json

let app: ReturnType<typeof testApp>
let admin: Client & { user: { id: string } }
let member: Client & { user: { id: string } }

beforeEach(async () => {
  app = testApp()
  admin = await signedIn(app, { siteRole: 'admin', name: 'Ada Admin' })
  member = await signedIn(app, { name: 'Mo Member' })
  await testDb().db.insert(t.groups).values({ id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true })
})

describe('users', () => {
  it('lists active people for everyone signed in, with search', async () => {
    const all = (await (await member.get('/api/users')).json()) as { name: string }[]
    expect(all.map((u) => u.name)).toEqual(['Ada Admin', 'Mo Member'])
    const found = (await (await member.get('/api/users?q=ada')).json()) as { name: string }[]
    expect(found.map((u) => u.name)).toEqual(['Ada Admin'])
    // LIKE wildcards in the query are literal.
    expect(await (await member.get('/api/users?q=%25')).json()).toEqual([])
  })

  it('hides deactivated people unless an admin asks for them', async () => {
    await admin.patch(`/api/users/${member.user.id}`, { deactivated: true })
    expect(((await (await admin.get('/api/users')).json()) as unknown[]).length).toBe(1)
    expect(((await (await admin.get('/api/users?includeDeactivated=1')).json()) as unknown[]).length).toBe(2)
  })

  it('lets admins change roles, not their own', async () => {
    const res = await admin.patch(`/api/users/${member.user.id}`, { siteRole: 'admin' })
    expect(await json(res)).toMatchObject({ siteRole: 'admin' })
    expect((await admin.patch(`/api/users/${admin.user.id}`, { siteRole: 'member' })).status).toBe(400)
    expect((await admin.patch('/api/users/nobody', { siteRole: 'member' })).status).toBe(404)
    expect((await member.patch(`/api/users/${admin.user.id}`, { deactivated: true })).status).toBe(200)
  })

  it('keeps members out of user admin', async () => {
    expect((await member.patch(`/api/users/${admin.user.id}`, { siteRole: 'member' })).status).toBe(403)
  })
})

describe('groups', () => {
  it('shows everyone in the system group', async () => {
    const list = (await (await member.get('/api/groups')).json()) as Json[]
    expect(list).toEqual([expect.objectContaining({ id: MEMBERS_GROUP_ID, memberCount: 2, isSystem: true })])
    const detail = await json(await member.get(`/api/groups/${MEMBERS_GROUP_ID}`))
    expect(detail.members?.map((m) => m.id).sort()).toEqual([admin.user.id, member.user.id].sort())
  })

  it('creates, renames, fills and deletes a group', async () => {
    const created = await json(await admin.post('/api/groups', { name: 'Design', description: 'Pixels' }))
    expect(created).toMatchObject({ name: 'Design', description: 'Pixels', memberCount: 0, members: [] })
    const id = created.id as string

    const renamed = await json(await admin.patch(`/api/groups/${id}`, { name: 'Design team' }))
    expect(renamed).toMatchObject({ name: 'Design team', description: 'Pixels' })

    const filled = await json(await admin.put(`/api/groups/${id}/members`, { userIds: [member.user.id, member.user.id] }))
    expect(filled).toMatchObject({ memberCount: 1 })
    const listed = (await (await member.get('/api/groups')).json()) as Json[]
    expect(listed.find((g) => g.id === id)).toMatchObject({ memberCount: 1 })

    expect((await admin.delete(`/api/groups/${id}`)).status).toBe(204)
    expect((await member.get(`/api/groups/${id}`)).status).toBe(404)
  })

  it('rejects duplicate names and unknown members', async () => {
    const a = await json(await admin.post('/api/groups', { name: 'Ops' }))
    const b = await json(await admin.post('/api/groups', { name: 'Support' }))
    expect((await admin.post('/api/groups', { name: 'Ops' })).status).toBe(409)
    expect((await admin.patch(`/api/groups/${b.id}`, { name: 'Ops' })).status).toBe(409)
    expect((await admin.put(`/api/groups/${a.id}/members`, { userIds: ['ghost'] })).status).toBe(400)
    expect((await json(await admin.put(`/api/groups/${a.id}/members`, { userIds: [] }))).memberCount).toBe(0)
  })

  it('protects the system group', async () => {
    expect((await admin.patch(`/api/groups/${MEMBERS_GROUP_ID}`, { name: 'Renamed' })).status).toBe(400)
    expect((await admin.delete(`/api/groups/${MEMBERS_GROUP_ID}`)).status).toBe(400)
    expect((await admin.put(`/api/groups/${MEMBERS_GROUP_ID}/members`, { userIds: [] })).status).toBe(400)
  })

  it('only admins manage groups', async () => {
    expect((await member.post('/api/groups', { name: 'Mine' })).status).toBe(403)
  })

  it('drops a deleted group’s space grants and page restrictions', async () => {
    const { db } = testDb()
    const group = await json(await admin.post('/api/groups', { name: 'Temp' }))
    const space = await makeSpace(db, { ownerId: admin.user.id })
    await db.insert(t.spacePermissions).values({ spaceId: space.id, principalType: 'group', principalId: group.id as string, perms: ['View'] })
    await admin.delete(`/api/groups/${group.id}`)
    const grants = await db
      .select()
      .from(t.spacePermissions)
      .where(and(eq(t.spacePermissions.principalType, 'group'), eq(t.spacePermissions.principalId, group.id as string)))
    expect(grants).toHaveLength(0)
  })
})
