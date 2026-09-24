import {
  evaluateSpaceAccess,
  MEMBERS_GROUP_ID,
  SPACE_PERMISSIONS,
  spaceCreateSchema,
  spacePatchSchema,
  spacePermissionsSchema,
  type GroupDto,
  type SpaceDto,
  type SpaceFacts,
  type SpaceGrantDto,
  type SpacePermission,
} from '@quire/shared'
import { http, HttpResponse } from 'msw'
import { fakeDb, type FakeSpace } from './db'
import { publishedCount } from './pages'
import { body, fail, withUser } from './util'

/** The spaces family of the fake API: same rules as `quire-api/src/routes/spaces.ts`. */

const facts = (s: FakeSpace): SpaceFacts => ({ ownerId: s.ownerId, archived: s.archived, grants: s.grants })

function memberCount(space: FakeSpace) {
  const active = new Set(fakeDb.activeUserIds())
  const viewers = new Set([space.ownerId])
  for (const g of space.grants) {
    if (!g.perms.some((p) => p === 'View' || p === 'Admin')) continue
    if (g.principalType === 'user') viewers.add(g.principalId)
    else if (g.principalId === MEMBERS_GROUP_ID) return active.size
    else for (const id of fakeDb.groups.get(g.principalId)?.memberIds ?? []) viewers.add(id)
  }
  return [...viewers].filter((id) => active.has(id)).length
}

export function spaceDto(space: FakeSpace, userId: string): SpaceDto {
  return {
    id: space.id,
    key: space.key,
    name: space.name,
    icon: space.icon,
    description: space.description,
    ownerId: space.ownerId,
    archived: space.archived,
    lastActivityAt: space.lastActivityAt,
    pageCount: publishedCount(space.id),
    memberCount: memberCount(space),
    starred: fakeDb.spaceStars.has(`${userId}:${space.id}`),
    watched: fakeDb.spaceWatches.has(`${userId}:${space.id}`),
    myPermissions: evaluateSpaceAccess(fakeDb.subject(userId), facts(space)).perms,
  }
}

/** The space by key or id if the person can view it; 404 otherwise, like the API. */
export function visibleSpace(keyOrId: string, userId: string) {
  const space = fakeDb.spaces.get(keyOrId) ?? [...fakeDb.spaces.values()].find((s) => s.key === keyOrId.toUpperCase())
  if (!space) return null
  const access = evaluateSpaceAccess(fakeDb.subject(userId), facts(space))
  return access.view ? { space, access } : null
}

const notFound = () => fail(404, 'not_found', 'Space was not found')
const notAdmin = () => fail(403, 'forbidden', 'Only space admins can do that')

function grantDtos(space: FakeSpace): SpaceGrantDto[] {
  const name = (type: string, id: string) => (type === 'user' ? fakeDb.users.get(id)?.name : fakeDb.groups.get(id)?.name) ?? id
  return space.grants
    .map((g) => ({ principalType: g.principalType, principalId: g.principalId, name: name(g.principalType, g.principalId), perms: SPACE_PERMISSIONS.filter((p) => g.perms.includes(p)) }))
    .sort((a, b) => (a.principalType === b.principalType ? a.name.localeCompare(b.name) : a.principalType === 'group' ? -1 : 1))
}

function toggle(kind: 'star' | 'watch') {
  const set = () => (kind === 'star' ? fakeDb.spaceStars : fakeDb.spaceWatches)
  return [
    http.put(`*/api/spaces/:key/${kind}`, withUser(({ params }, user) => {
      const found = visibleSpace(params.key as string, user.id)
      if (!found) return notFound()
      set().add(`${user.id}:${found.space.id}`)
      return new HttpResponse(null, { status: 204 })
    })),
    http.delete(`*/api/spaces/:key/${kind}`, withUser(({ params }, user) => {
      const found = visibleSpace(params.key as string, user.id)
      if (!found) return notFound()
      set().delete(`${user.id}:${found.space.id}`)
      return new HttpResponse(null, { status: 204 })
    })),
  ]
}

export const spaceHandlers = [
  http.get('*/api/users', withUser(() => {
    const users = fakeDb.activeUserIds().map((id) => fakeDb.userDto(id))
    return HttpResponse.json(users.sort((a, b) => a.name.localeCompare(b.name)))
  })),

  http.get('*/api/groups', withUser(() => {
    const active = fakeDb.activeUserIds()
    const groups: GroupDto[] = [...fakeDb.groups.values()].map(({ memberIds, ...g }) => ({
      ...g,
      memberCount: g.id === MEMBERS_GROUP_ID ? active.length : memberIds.filter((id) => active.includes(id)).length,
    }))
    return HttpResponse.json(groups.sort((a, b) => a.name.localeCompare(b.name)))
  })),

  http.get('*/api/spaces', withUser((_info, user) => {
    const list = [...fakeDb.spaces.values()].filter((s) => visibleSpace(s.id, user.id)).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
    return HttpResponse.json(list.map((s) => spaceDto(s, user.id)))
  })),

  http.post('*/api/spaces', withUser(async ({ request }, user) => {
    const input = await body(request, spaceCreateSchema)
    if (input instanceof Response) return input
    if ([...fakeDb.spaces.values()].some((s) => s.key === input.key)) return fail(409, 'key_taken', 'A space with that key already exists')
    const space: FakeSpace = {
      id: crypto.randomUUID(),
      ...input,
      ownerId: user.id,
      archived: false,
      lastActivityAt: new Date().toISOString(),
      grants: [
        { principalType: 'user', principalId: user.id, perms: [...SPACE_PERMISSIONS] },
        { principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: ['View', 'Add', 'Edit', 'Comment'] },
      ],
    }
    fakeDb.spaces.set(space.id, space)
    return HttpResponse.json(spaceDto(space, user.id), { status: 201 })
  })),

  http.get('*/api/spaces/:key', withUser(({ params }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    return found ? HttpResponse.json(spaceDto(found.space, user.id)) : notFound()
  })),

  http.patch('*/api/spaces/:key', withUser(async ({ params, request }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    if (!found) return notFound()
    if (!found.access.admin) return notAdmin()
    const input = await body(request, spacePatchSchema)
    if (input instanceof Response) return input
    if (input.key && [...fakeDb.spaces.values()].some((s) => s.key === input.key && s.id !== found.space.id)) return fail(409, 'key_taken', 'A space with that key already exists')
    for (const [k, v] of Object.entries(input)) if (v !== undefined) Object.assign(found.space, { [k]: v })
    return HttpResponse.json(spaceDto(found.space, user.id))
  })),

  http.delete('*/api/spaces/:key', withUser(({ params }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    if (!found) return notFound()
    if (!found.access.admin) return notAdmin()
    fakeDb.spaces.delete(found.space.id)
    return new HttpResponse(null, { status: 204 })
  })),

  ...(['archive', 'unarchive'] as const).map((action) =>
    http.post(`*/api/spaces/:key/${action}`, withUser(({ params }, user) => {
      const found = visibleSpace(params.key as string, user.id)
      if (!found) return notFound()
      if (!found.access.admin) return notAdmin()
      found.space.archived = action === 'archive'
      return HttpResponse.json(spaceDto(found.space, user.id))
    })),
  ),

  http.get('*/api/spaces/:key/permissions', withUser(({ params }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    if (!found) return notFound()
    if (!found.access.admin) return notAdmin()
    return HttpResponse.json(grantDtos(found.space))
  })),

  http.put('*/api/spaces/:key/permissions', withUser(async ({ params, request }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    if (!found) return notFound()
    if (!found.access.admin) return notAdmin()
    const input = await body(request, spacePermissionsSchema)
    if (input instanceof Response) return input
    const merged = new Map<string, { principalType: 'user' | 'group'; principalId: string; perms: Set<SpacePermission> }>()
    for (const g of input.grants) {
      const k = `${g.principalType}:${g.principalId}`
      const row = merged.get(k) ?? { principalType: g.principalType, principalId: g.principalId, perms: new Set<SpacePermission>() }
      for (const p of g.perms) row.perms.add(p)
      merged.set(k, row)
    }
    const rows = [...merged.values()].filter((r) => r.perms.size > 0)
    if (rows.some((r) => (r.principalType === 'user' ? !fakeDb.users.has(r.principalId) : !fakeDb.groups.has(r.principalId)))) {
      return fail(400, 'unknown_principal', 'One or more people or groups do not exist')
    }
    found.space.grants = rows.map((r) => ({ principalType: r.principalType, principalId: r.principalId, perms: SPACE_PERMISSIONS.filter((p) => r.perms.has(p)) }))
    return HttpResponse.json(grantDtos(found.space))
  })),

  ...toggle('star'),
  ...toggle('watch'),
]
