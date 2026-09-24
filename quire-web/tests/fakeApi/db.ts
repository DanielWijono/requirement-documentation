import {
  ALL_PERMS,
  initialsOf,
  MEMBER_DEFAULT_PERMS,
  MEMBERS_GROUP_ID,
  subjectOf,
  type GroupDto,
  type PageTreeNode,
  type SiteRole,
  type SpaceGrant,
  type Subject,
  type UserDto,
} from '@quire/shared'
import { labelToDate, pageTree as seedTree, SEED_PASSWORD, seedEmail, spaces as seedSpaces, users as seedUsers } from '@quire/shared/seed'

/**
 * The fake backend's in-memory state, seeded like `npm run db:seed` so UI tests see the demo workspace.
 * Behaviour it shares with the real API is pinned by the contract suite (`@quire/shared/contract`).
 */

export const SESSION_COOKIE = 'quire_session'
export const SEED_ADMIN_ID = 'u.daniel'
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const FAKE_ORIGIN = 'http://localhost:3000'

export interface FakeUser extends UserDto {
  password: string
}

export interface FakeSpace {
  id: string
  key: string
  name: string
  icon: string
  description: string
  ownerId: string
  archived: boolean
  lastActivityAt: string
  grants: SpaceGrant[]
  /** Published pages, until pages move into the fake. */
  pageCount: number
}

export interface FakeGroup extends Omit<GroupDto, 'memberCount'> {
  memberIds: string[]
}

interface FakeInvite {
  email: string
  siteRole: SiteRole
  inviterId: string
  expiresAt: number
  acceptedAt: number | null
}

export interface FakeMail {
  to: string
  text: string
}

function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
}

class FakeDb {
  users = new Map<string, FakeUser>()
  sessions = new Map<string, string>()
  invites = new Map<string, FakeInvite>()
  /** Reset token → user id. */
  resets = new Map<string, string>()
  mail: FakeMail[] = []
  groups = new Map<string, FakeGroup>()
  spaces = new Map<string, FakeSpace>()
  /** `${userId}:${spaceId}` */
  spaceStars = new Set<string>()
  spaceWatches = new Set<string>()

  constructor() {
    this.reset()
  }

  reset() {
    this.users = new Map(
      seedUsers.map((u) => [
        u.id,
        {
          id: u.id,
          name: u.name,
          email: seedEmail(u.name),
          initials: u.initials,
          colorSeed: u.colorSeed,
          siteRole: u.id === SEED_ADMIN_ID ? 'admin' : 'member',
          deactivated: false,
          password: SEED_PASSWORD,
        },
      ]),
    )
    this.sessions = new Map()
    this.invites = new Map()
    this.resets = new Map()
    this.mail = []
    this.groups = new Map([[MEMBERS_GROUP_ID, { id: MEMBERS_GROUP_ID, name: 'All members', description: 'Everyone with an active account.', isSystem: true, memberIds: [] }]])
    const now = new Date()
    this.spaces = new Map(
      seedSpaces.map((s) => [
        s.id,
        {
          id: s.id,
          key: s.key,
          name: s.name,
          icon: s.icon,
          description: s.description,
          ownerId: s.ownerId,
          archived: s.archived,
          lastActivityAt: labelToDate(s.lastActivity, now).toISOString(),
          grants: [
            { principalType: 'user', principalId: s.ownerId, perms: [...ALL_PERMS] },
            { principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: [...MEMBER_DEFAULT_PERMS] },
          ],
          pageCount: countPublished(seedTree[s.id] ?? []),
        },
      ]),
    )
    // Like the API seed: the admin's starred and watched flags become their stars and watches.
    this.spaceStars = new Set(seedSpaces.filter((s) => s.starred).map((s) => `${SEED_ADMIN_ID}:${s.id}`))
    this.spaceWatches = new Set(seedSpaces.filter((s) => s.watched).map((s) => `${SEED_ADMIN_ID}:${s.id}`))
  }

  subject(userId: string): Subject {
    const groupIds = [...this.groups.values()].filter((g) => g.memberIds.includes(userId)).map((g) => g.id)
    return subjectOf(userId, this.users.get(userId)!.siteRole, groupIds)
  }

  activeUserIds() {
    return [...this.users.values()].filter((u) => !u.deactivated).map((u) => u.id)
  }

  userDto(id: string): UserDto {
    const { password: _, ...dto } = this.users.get(id)!
    return dto
  }

  userByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase())
  }

  createSession(userId: string) {
    const t = token()
    this.sessions.set(t, userId)
    return t
  }

  createInvite(email: string, siteRole: SiteRole, inviterId: string) {
    const t = token()
    this.invites.set(t, { email, siteRole, inviterId, expiresAt: Date.now() + INVITE_TTL_MS, acceptedAt: null })
    this.mail.push({ to: email, text: `${this.users.get(inviterId)!.name} invited you to Quire.\n\nAccept the invite: ${FAKE_ORIGIN}/invite/${t}\n` })
    return t
  }

  requestReset(email: string) {
    const user = this.userByEmail(email)
    if (!user) return
    const t = token()
    this.resets.set(t, user.id)
    this.mail.push({ to: user.email, text: `Choose a new password: ${FAKE_ORIGIN}/reset-password?token=${t}\n` })
  }

  resetPassword(t: string, password: string) {
    const userId = this.resets.get(t)
    if (!userId) return false
    this.resets.delete(t)
    this.users.get(userId)!.password = password
    for (const [session, owner] of this.sessions) if (owner === userId) this.sessions.delete(session)
    return true
  }

  createUser(input: { email: string; name: string; password: string; siteRole: SiteRole }) {
    const id = `u.${token().slice(0, 12)}`
    this.users.set(id, { id, ...input, initials: initialsOf(input.name), colorSeed: this.users.size % 8, deactivated: false })
    return id
  }
}

function countPublished(nodes: PageTreeNode[]): number {
  return nodes.reduce((n, node) => n + (node.state === 'draft' ? 0 : 1) + countPublished(node.children), 0)
}

export const fakeDb = new FakeDb()
