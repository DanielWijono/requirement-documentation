import { groupInputSchema, groupMembersSchema, groupPatchSchema, MEMBERS_GROUP_ID, userUpdateSchema, type GroupDetailDto, type GroupDto, type InviteDto } from '@quire/shared'
import { http, HttpResponse } from 'msw'
import { fakeDb, type FakeGroup } from './db'
import { body, fail, withUser, type ResolverInfo } from './util'

/** People, invites and groups in the fake API: same rules as quire-api routes/users.ts, invites.ts and groups.ts. */

type User = NonNullable<ReturnType<typeof fakeDb.users.get>>

function adminOnly(fn: (info: ResolverInfo, user: User) => Response | Promise<Response>) {
  return withUser((info, user) => (user.siteRole === 'admin' ? fn(info, user) : fail(403, 'forbidden', 'Only site admins can do that')))
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

function groupDetail(g: FakeGroup): GroupDetailDto {
  const active = fakeDb.activeUserIds()
  const ids = g.id === MEMBERS_GROUP_ID ? active : g.memberIds.filter((id) => active.includes(id))
  const members = ids.map((id) => fakeDb.userDto(id)).sort(byName)
  return { id: g.id, name: g.name, description: g.description, isSystem: g.isSystem, memberCount: members.length, members }
}

function editableGroup(id: string): FakeGroup | Response {
  const g = fakeDb.groups.get(id)
  if (!g) return fail(404, 'not_found', 'Group was not found')
  return g.isSystem ? fail(400, 'system_group', 'The All members group is managed automatically') : g
}

const nameTaken = (name: string, except?: string) => [...fakeDb.groups.values()].some((g) => g.name === name && g.id !== except)

export const adminHandlers = [
  http.get('*/api/users', withUser(({ request }, user) => {
    const url = new URL(request.url)
    const all = url.searchParams.get('includeDeactivated') === '1' && user.siteRole === 'admin'
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const users = [...fakeDb.users.values()]
      .filter((u) => all || !u.deactivated)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q))
      .map((u) => fakeDb.userDto(u.id))
    return HttpResponse.json(users.sort(byName))
  })),

  http.patch('*/api/users/:id', adminOnly(async ({ params, request }, admin) => {
    const input = await body(request, userUpdateSchema)
    if (input instanceof Response) return input
    if (params.id === admin.id) return fail(400, 'self_update', 'You cannot change your own role or deactivate yourself')
    const target = fakeDb.users.get(params.id as string)
    if (!target) return fail(404, 'not_found', 'User was not found')
    if (input.siteRole) target.siteRole = input.siteRole
    if (input.deactivated !== undefined) {
      target.deactivated = input.deactivated
      // Deactivation ends every session.
      if (input.deactivated) for (const [token, owner] of fakeDb.sessions) if (owner === target.id) fakeDb.sessions.delete(token)
    }
    return HttpResponse.json(fakeDb.userDto(target.id))
  })),

  http.get('*/api/invites', adminOnly(() => {
    const pending: InviteDto[] = [...fakeDb.invites.values()]
      .filter((i) => !i.acceptedAt && i.expiresAt > Date.now())
      .map((i) => ({ id: i.id, email: i.email, siteRole: i.siteRole, invitedBy: fakeDb.users.get(i.inviterId)!.name, expiresAt: new Date(i.expiresAt).toISOString() }))
    return HttpResponse.json(pending.reverse())
  })),

  http.delete('*/api/invites/:id', adminOnly(({ params }) => {
    const entry = [...fakeDb.invites.entries()].find(([, i]) => i.id === params.id)
    if (!entry) return fail(404, 'not_found', 'Invite was not found')
    fakeDb.invites.delete(entry[0])
    return new HttpResponse(null, { status: 204 })
  })),

  http.get('*/api/groups/:id', withUser(({ params }) => {
    const g = fakeDb.groups.get(params.id as string)
    return g ? HttpResponse.json(groupDetail(g)) : fail(404, 'not_found', 'Group was not found')
  })),

  http.get('*/api/groups', withUser(() => {
    const groups: GroupDto[] = [...fakeDb.groups.values()].map((g) => {
      const { members: _members, ...rest } = groupDetail(g)
      return rest
    })
    return HttpResponse.json(groups.sort(byName))
  })),

  http.post('*/api/groups', adminOnly(async ({ request }) => {
    const input = await body(request, groupInputSchema)
    if (input instanceof Response) return input
    if (nameTaken(input.name)) return fail(409, 'name_taken', 'A group with that name already exists')
    const g: FakeGroup = { id: crypto.randomUUID(), name: input.name, description: input.description, isSystem: false, memberIds: [] }
    fakeDb.groups.set(g.id, g)
    return HttpResponse.json(groupDetail(g), { status: 201 })
  })),

  http.patch('*/api/groups/:id', adminOnly(async ({ params, request }) => {
    const g = editableGroup(params.id as string)
    if (g instanceof Response) return g
    const input = await body(request, groupPatchSchema)
    if (input instanceof Response) return input
    if (input.name && nameTaken(input.name, g.id)) return fail(409, 'name_taken', 'A group with that name already exists')
    if (input.name !== undefined) g.name = input.name
    if (input.description !== undefined) g.description = input.description
    return HttpResponse.json(groupDetail(g))
  })),

  http.delete('*/api/groups/:id', adminOnly(({ params }) => {
    const g = editableGroup(params.id as string)
    if (g instanceof Response) return g
    // Grants and restrictions name the group by id; they go with it.
    for (const s of fakeDb.spaces.values()) s.grants = s.grants.filter((r) => !(r.principalType === 'group' && r.principalId === g.id))
    for (const p of fakeDb.pages.values()) p.restrictions = p.restrictions.filter((r) => !(r.principalType === 'group' && r.principalId === g.id))
    fakeDb.groups.delete(g.id)
    return new HttpResponse(null, { status: 204 })
  })),

  http.put('*/api/groups/:id/members', adminOnly(async ({ params, request }) => {
    const g = editableGroup(params.id as string)
    if (g instanceof Response) return g
    const input = await body(request, groupMembersSchema)
    if (input instanceof Response) return input
    const ids = [...new Set(input.userIds)]
    if (ids.some((id) => !fakeDb.users.has(id))) return fail(400, 'unknown_user', 'One or more people do not exist')
    g.memberIds = ids
    return HttpResponse.json(groupDetail(g))
  })),
]
