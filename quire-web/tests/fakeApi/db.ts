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
import {
  labelToDate,
  pages as seedPages,
  pageTree as seedTree,
  recentlyViewedSeed,
  SEED_PASSWORD,
  seedEmail,
  spaces as seedSpaces,
  users as seedUsers,
} from '@quire/shared/seed'

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
}

export interface FakeDraft {
  html: string
  rev: number
  updatedAt: string
  updatedById: string
}

export interface FakeVersion {
  version: number
  html: string | null
  title: string
  authorId: string
  comment: string
  createdAt: string
}

export interface FakeRestriction {
  kind: 'view' | 'edit'
  principalType: 'user' | 'group'
  principalId: string
}

export interface FakePage {
  id: string
  spaceId: string
  parentId: string | null
  position: number
  title: string
  icon: string | null
  status: 'draft' | 'published' | 'archived' | 'deleted'
  statusBeforeTrash: 'draft' | 'published' | null
  ownerId: string
  updatedById: string
  publishedHtml: string | null
  publishedVersion: number
  lockVersion: number
  wordCount: number
  widthMode: 'reading' | 'wide' | 'full'
  isBlogPost: boolean
  createdAt: string
  updatedAt: string
  draft: FakeDraft | null
  versions: FakeVersion[]
  restrictions: FakeRestriction[]
  collaborators: string[]
  labels: string[]
}

export interface FakeComment {
  id: string
  pageId: string
  parentId: string | null
  authorId: string
  body: string
  anchorText: string | null
  resolvedAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FakeGroup extends Omit<GroupDto, 'memberCount'> {
  memberIds: string[]
}

interface FakeInvite {
  id: string
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
  pages = new Map<string, FakePage>()
  comments = new Map<string, FakeComment>()
  /** `${userId}:${pageId}` */
  pageStars = new Set<string>()
  pageWatches = new Set<string>()
  /** `${userId}:${pageId}` → ISO time */
  recentViews = new Map<string, string>()

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
        },
      ]),
    )
    // Like the API seed: the admin's starred and watched flags become their stars and watches.
    this.spaceStars = new Set(seedSpaces.filter((s) => s.starred).map((s) => `${SEED_ADMIN_ID}:${s.id}`))
    this.spaceWatches = new Set(seedSpaces.filter((s) => s.watched).map((s) => `${SEED_ADMIN_ID}:${s.id}`))
    this.seedPages(now)
  }

  /** The same mapping as the API's `db:seed` (quire-api/src/db/seed.ts). */
  private seedPages(now: Date) {
    const at = (label: string) => labelToDate(label, now).toISOString()
    const positions = new Map<string, number>()
    const walk = (nodes: PageTreeNode[]) =>
      nodes.forEach((n, i) => {
        positions.set(n.id, i + 1)
        walk(n.children)
      })
    Object.values(seedTree).forEach(walk)

    this.pages = new Map()
    this.comments = new Map()
    this.pageStars = new Set()
    this.pageWatches = new Set()
    for (const p of Object.values(seedPages)) {
      const publishedHtml = p.publishedHtml ?? (p.state === 'draft' ? null : p.contentHtml)
      const status = p.state === 'draft' || p.state === 'archived' || p.state === 'deleted' ? p.state : 'published'
      const updated = at(p.updatedRelative)
      const oldest = p.versions.at(-1)
      const restrictions: FakeRestriction[] = [
        ...(p.viewerIds ?? []).map((id) => ({ kind: 'view' as const, principalType: 'user' as const, principalId: id })),
        ...(p.editorIds ?? []).map((id) => ({ kind: 'edit' as const, principalType: 'user' as const, principalId: id })),
      ]
      if (p.restricted && restrictions.length === 0) {
        for (const id of new Set([p.ownerId, SEED_ADMIN_ID])) restrictions.push({ kind: 'edit', principalType: 'user', principalId: id })
      }
      this.pages.set(p.id, {
        id: p.id,
        spaceId: p.spaceId,
        parentId: p.parentId,
        position: positions.get(p.id) ?? 0,
        title: p.title,
        icon: p.icon ?? null,
        status,
        statusBeforeTrash: status === 'archived' || status === 'deleted' ? (publishedHtml === null ? 'draft' : 'published') : null,
        ownerId: p.ownerId,
        updatedById: p.updatedById,
        publishedHtml,
        publishedVersion: p.versions[0]?.version ?? 0,
        lockVersion: 0,
        wordCount: p.wordCount,
        widthMode: p.widthMode,
        isBlogPost: p.isBlogPost ?? false,
        createdAt: oldest ? at(oldest.relativeTime) : updated,
        updatedAt: updated,
        draft: publishedHtml === null || p.contentHtml !== publishedHtml ? { html: p.contentHtml, rev: 1, updatedAt: updated, updatedById: p.updatedById } : null,
        versions: p.versions.map((v) => ({ version: v.version, html: v.contentHtml ?? (v.current ? publishedHtml : null), title: p.title, authorId: v.authorId, comment: v.comment, createdAt: at(v.relativeTime) })),
        restrictions,
        collaborators: [],
        labels: p.labels.map((l) => l.name),
      })
      if (p.starred) this.pageStars.add(`${SEED_ADMIN_ID}:${p.id}`)
      for (const c of p.comments) {
        const created = at(c.relativeTime)
        this.comments.set(c.id, { id: c.id, pageId: p.id, parentId: null, authorId: c.authorId, body: c.body, anchorText: c.anchorText ?? null, resolvedAt: c.resolved ? created : null, deletedAt: null, createdAt: created, updatedAt: created })
        for (const r of c.replies ?? []) {
          const rAt = at(r.relativeTime)
          this.comments.set(r.id, { id: r.id, pageId: p.id, parentId: c.id, authorId: r.authorId, body: r.body, anchorText: null, resolvedAt: null, deletedAt: null, createdAt: rAt, updatedAt: rAt })
        }
      }
    }
    this.recentViews = new Map(recentlyViewedSeed.map((r) => [`${SEED_ADMIN_ID}:${r.pageId}`, at(r.relativeTime)]))
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
    this.invites.set(t, { id: crypto.randomUUID(), email, siteRole, inviterId, expiresAt: Date.now() + INVITE_TTL_MS, acceptedAt: null })
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

export const fakeDb = new FakeDb()
