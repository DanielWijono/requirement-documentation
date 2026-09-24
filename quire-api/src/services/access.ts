import {
  evaluatePageAccess,
  evaluateSpaceAccess,
  subjectOf,
  type PageAccess,
  type PageFacts,
  type PrincipalRef,
  type SpaceAccess,
  type SpaceFacts,
  type SpacePermission,
  type Subject,
} from '@quire/shared'
import { eq, or, sql, type SQL } from 'drizzle-orm'
import type { SessionUser } from '../app.ts'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { forbidden, notFound } from '../lib/errors.ts'

/**
 * Loads the facts `evaluateAccess` needs and turns the same rule into SQL for list queries.
 * Single resources: load facts, evaluate in TypeScript. Lists: filter with the SQL below.
 * `tests/access.test.ts` checks the two agree.
 */

export async function loadSubject(db: Queryable, user: SessionUser): Promise<Subject> {
  const rows = await db.select({ groupId: t.groupMembers.groupId }).from(t.groupMembers).where(eq(t.groupMembers.userId, user.id))
  return subjectOf(
    user.id,
    user.siteRole,
    rows.map((r) => r.groupId),
  )
}

export type SpaceRow = typeof t.spaces.$inferSelect

export async function loadSpaceFacts(db: Queryable, space: SpaceRow): Promise<SpaceFacts> {
  const grants = await db
    .select({ principalType: t.spacePermissions.principalType, principalId: t.spacePermissions.principalId, perms: t.spacePermissions.perms })
    .from(t.spacePermissions)
    .where(eq(t.spacePermissions.spaceId, space.id))
  return { ownerId: space.ownerId, archived: space.archivedAt !== null, grants: grants as SpaceFacts['grants'] }
}

export interface SpaceContext {
  space: SpaceRow
  facts: SpaceFacts
  access: SpaceAccess
}

/**
 * A space by key or id the subject can view; 404 otherwise, so hidden spaces don't reveal they exist.
 * Keys are upper case letters and digits and ids never are, so the two can't collide.
 */
export async function spaceForSubject(db: Queryable, subject: Subject, keyOrId: string): Promise<SpaceContext> {
  const [space] = await db
    .select()
    .from(t.spaces)
    .where(or(eq(t.spaces.key, keyOrId.toUpperCase()), eq(t.spaces.id, keyOrId)))
  if (!space) throw notFound('Space')
  const facts = await loadSpaceFacts(db, space)
  const access = evaluateSpaceAccess(subject, facts)
  if (!access.view) throw notFound('Space')
  return { space, facts, access }
}

export function requireSpaceAdmin(ctx: SpaceContext) {
  if (!ctx.access.admin) throw forbidden('Only space admins can do that')
  return ctx
}

export type PageRow = typeof t.pages.$inferSelect

/** The page's restriction lists: view lists from it and every ancestor, edit list from itself. */
export async function loadPageFacts(db: Queryable, page: PageRow): Promise<PageFacts> {
  const rows = await db.execute<{ page_id: string; kind: 'view' | 'edit'; principal_type: 'user' | 'group'; principal_id: string }>(sql`
    with recursive chain(id, parent_id, depth) as (
      select id, parent_id, 0 from pages where id = ${page.id}
      union all
      select p.id, p.parent_id, c.depth + 1 from pages p join chain c on p.id = c.parent_id
    )
    select r.page_id, r.kind, r.principal_type, r.principal_id
    from chain c join page_restrictions r on r.page_id = c.id
    where r.kind = 'view' or c.depth = 0
  `)
  const viewLists = new Map<string, PrincipalRef[]>()
  const editList: PrincipalRef[] = []
  for (const r of rows) {
    const ref: PrincipalRef = { type: r.principal_type, id: r.principal_id }
    if (r.kind === 'edit') editList.push(ref)
    else viewLists.set(r.page_id, [...(viewLists.get(r.page_id) ?? []), ref])
  }
  const collaborators = await db.select({ userId: t.pageCollaborators.userId }).from(t.pageCollaborators).where(eq(t.pageCollaborators.pageId, page.id))
  return {
    ownerId: page.ownerId,
    status: page.status,
    collaboratorIds: collaborators.map((c) => c.userId),
    viewLists: [...viewLists.values()],
    editList,
  }
}

export interface PageContext {
  page: PageRow
  space: SpaceContext
  access: PageAccess
}

/**
 * A page the subject can view. 404 when the page is missing or its space is hidden;
 * 403 when the space is visible but the page is restricted, a draft or in the trash.
 */
export async function pageForSubject(db: Queryable, subject: Subject, pageId: string): Promise<PageContext> {
  const [row] = await db.select({ page: t.pages, space: t.spaces }).from(t.pages).innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId)).where(eq(t.pages.id, pageId))
  if (!row) throw notFound('Page')
  const facts = await loadSpaceFacts(db, row.space)
  const spaceAccess = evaluateSpaceAccess(subject, facts)
  if (!spaceAccess.view) throw notFound('Page')
  const access = evaluatePageAccess(subject, facts, await loadPageFacts(db, row.page))
  if (!access.view) throw forbidden('This page is restricted')
  return { page: row.page, space: { space: row.space, facts, access: spaceAccess }, access }
}

// ---------------------------------------------------------------------------
// SQL filters for lists. They reference the outer `spaces` / `pages` tables by name, so use them
// in queries where those tables are not aliased.

const permArray = (perms: readonly SpacePermission[]) => sql.raw(`array[${perms.map((p) => `'${p}'`).join(',')}]::text[]`)

function isSubject(subject: Subject, typeCol: SQL, idCol: SQL): SQL {
  const groups = sql.join(
    subject.groupIds.map((g) => sql`${g}`),
    sql`, `,
  )
  return sql`((${typeCol} = 'user' and ${idCol} = ${subject.userId}) or (${typeCol} = 'group' and ${idCol} in (${groups})))`
}

/** True when the subject holds any of `perms` (or Admin) in the space whose id is `spaceId`. */
export function hasSpacePermSql(subject: Subject, spaceId: SQL, perms: readonly SpacePermission[]): SQL {
  if (subject.siteRole === 'admin') return sql`true`
  return sql`(
    exists (select 1 from spaces s where s.id = ${spaceId} and s.owner_id = ${subject.userId})
    or exists (
      select 1 from space_permissions sp
      where sp.space_id = ${spaceId}
        and sp.perms && ${permArray([...perms, 'Admin'])}
        and ${isSubject(subject, sql`sp.principal_type`, sql`sp.principal_id`)}
    )
  )`
}

/** Filter on `spaces`: the ones the subject can view. */
export function visibleSpacesSql(subject: Subject): SQL {
  return hasSpacePermSql(subject, sql`${t.spaces.id}`, ['View'])
}

/** Filter on `pages`: the ones the subject can view, by the same rule as `evaluatePageAccess`. */
export function visiblePagesSql(subject: Subject): SQL {
  const pageId = sql`${t.pages.id}`
  return sql`(
    ${hasSpacePermSql(subject, sql`${t.pages.spaceId}`, ['View'])}
    and (${t.pages.status} <> 'draft' or ${t.pages.ownerId} = ${subject.userId}
      or exists (select 1 from page_collaborators pc where pc.page_id = ${pageId} and pc.user_id = ${subject.userId}))
    and (${t.pages.status} not in ('archived', 'deleted') or ${t.pages.ownerId} = ${subject.userId}
      or ${hasSpacePermSql(subject, sql`${t.pages.spaceId}`, ['Delete'])})
    and not exists (
      with recursive chain(id, parent_id) as (
        select ${pageId}, ${t.pages.parentId}
        union all
        select p.id, p.parent_id from pages p join chain c on p.id = c.parent_id
      )
      select 1 from chain c
      where exists (select 1 from page_restrictions r where r.page_id = c.id and r.kind = 'view')
        and not exists (
          select 1 from page_restrictions r
          where r.page_id = c.id and r.kind = 'view' and ${isSubject(subject, sql`r.principal_type`, sql`r.principal_id`)}
        )
    )
  )`
}
