import { evaluateSpaceAccess, MEMBERS_GROUP_ID, type SpaceDto, type SpaceFacts, type SpacePermission, type Subject } from '@quire/shared'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import type { SpaceRow } from './access.ts'

/** Space DTOs for many spaces with a fixed number of queries. */
export async function toSpaceDtos(db: Queryable, subject: Subject, rows: SpaceRow[]): Promise<SpaceDto[]> {
  if (rows.length === 0) return []
  const ids = rows.map((s) => s.id)
  const [grants, pageCounts, stars, watches, activeUsers, memberships] = await Promise.all([
    db.select().from(t.spacePermissions).where(inArray(t.spacePermissions.spaceId, ids)),
    db
      .select({ spaceId: t.pages.spaceId, n: count() })
      .from(t.pages)
      .where(and(inArray(t.pages.spaceId, ids), eq(t.pages.status, 'published')))
      .groupBy(t.pages.spaceId),
    db.select({ spaceId: t.spaceStars.spaceId }).from(t.spaceStars).where(and(eq(t.spaceStars.userId, subject.userId), inArray(t.spaceStars.spaceId, ids))),
    db.select({ spaceId: t.spaceWatches.spaceId }).from(t.spaceWatches).where(and(eq(t.spaceWatches.userId, subject.userId), inArray(t.spaceWatches.spaceId, ids))),
    db.select({ id: t.user.id }).from(t.user).where(isNull(t.user.deactivatedAt)),
    db
      .select({ groupId: t.groupMembers.groupId, userId: t.groupMembers.userId })
      .from(t.groupMembers)
      .innerJoin(t.user, eq(t.user.id, t.groupMembers.userId))
      .where(isNull(t.user.deactivatedAt)),
  ])

  const active = new Set(activeUsers.map((u) => u.id))
  const membersOf = new Map<string, string[]>()
  for (const m of memberships) membersOf.set(m.groupId, [...(membersOf.get(m.groupId) ?? []), m.userId])
  const starred = new Set(stars.map((s) => s.spaceId))
  const watched = new Set(watches.map((s) => s.spaceId))
  const pagesIn = new Map(pageCounts.map((p) => [p.spaceId, p.n]))

  return rows.map((space) => {
    const spaceGrants = grants.filter((g) => g.spaceId === space.id) as (SpaceFacts['grants'][number] & { spaceId: string })[]
    const facts: SpaceFacts = { ownerId: space.ownerId, archived: space.archivedAt !== null, grants: spaceGrants }
    return {
      id: space.id,
      key: space.key,
      name: space.name,
      icon: space.icon,
      description: space.description,
      ownerId: space.ownerId,
      archived: space.archivedAt !== null,
      lastActivityAt: space.lastActivityAt.toISOString(),
      pageCount: pagesIn.get(space.id) ?? 0,
      memberCount: viewerCount(facts, active, membersOf),
      starred: starred.has(space.id),
      watched: watched.has(space.id),
      myPermissions: evaluateSpaceAccess(subject, facts).perms,
    }
  })
}

const VIEWING: SpacePermission[] = ['View', 'Admin']

/** Active people the matrix lets in: the owner plus everyone named by a row with View or Admin. */
function viewerCount(facts: SpaceFacts, active: Set<string>, membersOf: Map<string, string[]>) {
  const viewers = new Set<string>([facts.ownerId])
  for (const g of facts.grants) {
    if (!g.perms.some((p) => VIEWING.includes(p))) continue
    if (g.principalType === 'user') viewers.add(g.principalId)
    else if (g.principalId === MEMBERS_GROUP_ID) return active.size
    else for (const id of membersOf.get(g.principalId) ?? []) viewers.add(id)
  }
  return [...viewers].filter((id) => active.has(id)).length
}
