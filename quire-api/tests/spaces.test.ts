import { MEMBERS_GROUP_ID, type SpaceDto, type SpaceGrantDto } from '@quire/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { client, signedIn, testApp, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'
import { makePage } from './helpers/factories.ts'

type Person = Client & { user: { id: string } }

let app: ReturnType<typeof testApp>
let owner: Person
let member: Person

const body = async <T>(res: Response) => (await res.json()) as T

beforeEach(async () => {
  app = testApp()
  await testDb().db.insert(t.groups).values([
    { id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true },
    { id: 'g.readers', name: 'Readers' },
  ])
  owner = await signedIn(app, { name: 'Olive Owner' })
  member = await signedIn(app, { name: 'Max Member' })
})

async function createTeam(key = 'team') {
  const res = await owner.post('/api/spaces', { key, name: key[0].toUpperCase() + key.slice(1), description: 'Our space' })
  expect(res.status).toBe(201)
  return body<SpaceDto>(res)
}

describe('creating spaces', () => {
  it('normalizes the key, makes the creator owner and grants the member defaults', async () => {
    const space = await createTeam()
    expect(space).toMatchObject({
      key: 'TEAM',
      name: 'Team',
      icon: '📁',
      ownerId: owner.user.id,
      archived: false,
      pageCount: 0,
      memberCount: 2,
      starred: false,
      myPermissions: ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin'],
    })
    const seen = await body<SpaceDto>(await member.get('/api/spaces/team'))
    expect(seen.myPermissions).toEqual(['View', 'Add', 'Edit', 'Comment'])
  })

  it('rejects duplicate and malformed keys', async () => {
    await createTeam()
    const dup = await member.post('/api/spaces', { key: 'Team', name: 'Again' })
    expect(dup.status).toBe(409)
    expect(await dup.json()).toMatchObject({ code: 'key_taken' })
    expect((await member.post('/api/spaces', { key: '9X', name: 'Bad' })).status).toBe(400)
    expect((await member.post('/api/spaces', { key: 'OK', name: '' })).status).toBe(400)
  })

  it('requires a session', async () => {
    expect((await client(app).post('/api/spaces', { key: 'ANON', name: 'Anon' })).status).toBe(401)
    expect((await client(app).get('/api/spaces')).status).toBe(401)
  })
})

describe('listing spaces', () => {
  it('shows only spaces the person can view, with counts and personal flags', async () => {
    const team = await createTeam()
    await createTeam('private')
    await owner.put('/api/spaces/PRIVATE/permissions', { grants: [] })
    await makePage(testDb().db, { spaceId: team.id, ownerId: owner.user.id, status: 'published' })
    await makePage(testDb().db, { spaceId: team.id, ownerId: owner.user.id, status: 'draft' })
    expect((await member.put('/api/spaces/TEAM/star')).status).toBe(204)
    expect((await member.put('/api/spaces/TEAM/star')).status).toBe(204)
    expect((await member.put('/api/spaces/TEAM/watch')).status).toBe(204)

    const list = await body<SpaceDto[]>(await member.get('/api/spaces'))
    expect(list).toEqual([expect.objectContaining({ key: 'TEAM', pageCount: 1, memberCount: 2, starred: true, watched: true })])
    expect((await body<SpaceDto[]>(await owner.get('/api/spaces'))).map((s) => [s.key, s.starred])).toEqual([
      ['PRIVATE', false],
      ['TEAM', false],
    ])

    expect((await member.delete('/api/spaces/TEAM/star')).status).toBe(204)
    expect((await body<SpaceDto>(await member.get('/api/spaces/TEAM'))).starred).toBe(false)
    expect((await member.put('/api/spaces/PRIVATE/watch')).status).toBe(404)
  })

  it('lets site admins see every space', async () => {
    await createTeam()
    await owner.put('/api/spaces/TEAM/permissions', { grants: [] })
    const admin = await signedIn(app, { siteRole: 'admin' })
    expect((await body<SpaceDto[]>(await admin.get('/api/spaces'))).map((s) => s.key)).toEqual(['TEAM'])
  })
})

describe('the permissions matrix', () => {
  it('replaces the grants, merging duplicates and dropping empty rows', async () => {
    await createTeam()
    const res = await owner.put('/api/spaces/TEAM/permissions', {
      grants: [
        { principalType: 'user', principalId: member.user.id, perms: ['View'] },
        { principalType: 'user', principalId: member.user.id, perms: ['Comment', 'View'] },
        { principalType: 'group', principalId: 'g.readers', perms: ['View'] },
        { principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: [] },
      ],
    })
    expect(res.status).toBe(200)
    expect(await body<SpaceGrantDto[]>(res)).toEqual([
      { principalType: 'group', principalId: 'g.readers', name: 'Readers', perms: ['View'] },
      { principalType: 'user', principalId: member.user.id, name: 'Max Member', perms: ['View', 'Comment'] },
    ])
    expect(await body<SpaceGrantDto[]>(await owner.get('/api/spaces/TEAM/permissions'))).toHaveLength(2)
    expect((await body<SpaceDto>(await member.get('/api/spaces/TEAM'))).myPermissions).toEqual(['View', 'Comment'])
  })

  it('counts members through groups', async () => {
    await createTeam()
    const reader = await signedIn(app, { name: 'Rita Reader' })
    await testDb().db.insert(t.groupMembers).values({ groupId: 'g.readers', userId: reader.user.id })
    await owner.put('/api/spaces/TEAM/permissions', { grants: [{ principalType: 'group', principalId: 'g.readers', perms: ['View'] }] })
    expect((await body<SpaceDto>(await reader.get('/api/spaces/TEAM'))).memberCount).toBe(2)
    expect((await member.get('/api/spaces/TEAM')).status).toBe(404)
  })

  it('rejects unknown people and groups', async () => {
    await createTeam()
    for (const principalType of ['user', 'group']) {
      const res = await owner.put('/api/spaces/TEAM/permissions', { grants: [{ principalType, principalId: 'nobody', perms: ['View'] }] })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'unknown_principal' })
    }
    expect((await owner.put('/api/spaces/TEAM/permissions', { grants: [{ principalType: 'user', principalId: 'x', perms: ['Fly'] }] })).status).toBe(400)
  })

  it('keeps the owner in charge whatever the matrix says', async () => {
    await createTeam()
    await owner.put('/api/spaces/TEAM/permissions', { grants: [] })
    expect((await owner.get('/api/spaces/TEAM/permissions')).status).toBe(200)
  })

  it('names principals that no longer exist by their id', async () => {
    await createTeam()
    await owner.put('/api/spaces/TEAM/permissions', { grants: [{ principalType: 'group', principalId: 'g.readers', perms: ['View'] }] })
    await testDb().db.delete(t.groups).where(eq(t.groups.id, 'g.readers'))
    // Rows left behind by a direct delete still render rather than failing the whole matrix.
    await testDb().db.insert(t.spacePermissions).values({ spaceId: (await body<SpaceDto>(await owner.get('/api/spaces/TEAM'))).id, principalType: 'group', principalId: 'g.gone', perms: ['View'] })
    expect(await body<SpaceGrantDto[]>(await owner.get('/api/spaces/TEAM/permissions'))).toEqual([
      expect.objectContaining({ principalId: 'g.gone', name: 'g.gone' }),
      expect.objectContaining({ principalId: 'g.readers', name: 'g.readers' }),
    ])
  })
})

describe('archiving and editing', () => {
  it('archives read-only and back', async () => {
    await createTeam()
    const archived = await body<SpaceDto>(await owner.post('/api/spaces/TEAM/archive'))
    expect(archived.archived).toBe(true)
    const restored = await body<SpaceDto>(await owner.post('/api/spaces/TEAM/unarchive'))
    expect(restored.archived).toBe(false)
  })

  it('patches details and rejects empty patches', async () => {
    await createTeam()
    const res = await owner.patch('/api/spaces/TEAM', { name: 'Team HQ', icon: '🏠' })
    expect(await body<SpaceDto>(res)).toMatchObject({ name: 'Team HQ', icon: '🏠', description: 'Our space' })
    expect((await owner.patch('/api/spaces/TEAM', {})).status).toBe(400)
  })

  it('finds spaces by id as well as key, and renames keys', async () => {
    const team = await createTeam()
    await createTeam('ops')
    expect((await body<SpaceDto>(await member.get(`/api/spaces/${team.id}`))).key).toBe('TEAM')
    expect(await body<SpaceDto>(await owner.patch(`/api/spaces/${team.id}`, { key: 'crew' }))).toMatchObject({ id: team.id, key: 'CREW' })
    expect((await member.get('/api/spaces/TEAM')).status).toBe(404)
    const taken = await owner.patch('/api/spaces/CREW', { key: 'OPS' })
    expect(taken.status).toBe(409)
    expect(await taken.json()).toMatchObject({ code: 'key_taken' })
  })
})

/**
 * Route × role matrix. Each role walks every route in an order that leaves the space usable
 * until the end: reads, idempotent writes, then archive, then delete.
 */
describe('route × role matrix', () => {
  type Role = 'anonymous' | 'site admin' | 'owner' | 'space admin' | 'member' | 'reader' | 'outsider'
  const routes = ['get', 'star', 'getPermissions', 'putPermissions', 'patch', 'archive', 'unarchive', 'delete'] as const
  const ok = { get: 200, star: 204, getPermissions: 200, putPermissions: 200, patch: 200, archive: 200, unarchive: 200, delete: 204 }
  const readOnly = { ...ok, getPermissions: 403, putPermissions: 403, patch: 403, archive: 403, unarchive: 403, delete: 403 }
  const hidden = Object.fromEntries(routes.map((r) => [r, 404]))
  const matrix: Record<Role, Record<(typeof routes)[number], number>> = {
    anonymous: Object.fromEntries(routes.map((r) => [r, 401])) as typeof ok,
    'site admin': ok,
    owner: ok,
    'space admin': ok,
    member: readOnly,
    reader: readOnly,
    outsider: hidden as typeof ok,
  }

  it.each(Object.keys(matrix) as Role[])('%s', async (role) => {
    await createTeam()
    const spaceAdmin = await signedIn(app, { name: 'Sam Spaceadmin' })
    const reader = await signedIn(app, { name: 'Rita Reader' })
    const outsider = await signedIn(app, { name: 'Oscar Outsider' })
    await testDb().db.insert(t.groupMembers).values({ groupId: 'g.readers', userId: reader.user.id })
    const grants = [
      { principalType: 'user', principalId: spaceAdmin.user.id, perms: ['Admin'] },
      { principalType: 'group', principalId: 'g.readers', perms: ['View'] },
      { principalType: 'user', principalId: member.user.id, perms: ['View', 'Add', 'Edit', 'Comment'] },
    ]
    expect((await owner.put('/api/spaces/TEAM/permissions', { grants })).status).toBe(200)

    const who: Record<Role, () => Promise<Client>> = {
      anonymous: async () => client(app),
      'site admin': () => signedIn(app, { siteRole: 'admin' }),
      owner: async () => owner,
      'space admin': async () => spaceAdmin,
      member: async () => member,
      reader: async () => reader,
      outsider: async () => outsider,
    }
    const c = await who[role]()
    const call = {
      get: () => c.get('/api/spaces/TEAM'),
      star: () => c.put('/api/spaces/TEAM/star'),
      getPermissions: () => c.get('/api/spaces/TEAM/permissions'),
      putPermissions: () => c.put('/api/spaces/TEAM/permissions', { grants }),
      patch: () => c.patch('/api/spaces/TEAM', { description: 'Changed' }),
      archive: () => c.post('/api/spaces/TEAM/archive'),
      unarchive: () => c.post('/api/spaces/TEAM/unarchive'),
      delete: () => c.delete('/api/spaces/TEAM'),
    }
    const got: Record<string, number> = {}
    for (const r of routes) got[r] = (await call[r]()).status
    expect(got).toEqual(matrix[role])
  })
})
