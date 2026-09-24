import type { PageDto, PageNodeDto, PrincipalDto, PrincipalRef, Subject } from '@quire/shared'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { badRequest } from '../lib/errors.ts'
import { visiblePagesSql, type PageContext } from './access.ts'

const LIVE = ['draft', 'published'] as const

/** The page and its ancestors, root first. */
export async function ancestorsOf(db: Queryable, pageId: string): Promise<{ id: string; title: string }[]> {
  const rows = await db.execute<{ id: string; title: string; depth: number }>(sql`
    with recursive chain(id, parent_id, title, depth) as (
      select id, parent_id, title, 0 from pages where id = ${pageId}
      union all
      select p.id, p.parent_id, p.title, c.depth + 1 from pages p join chain c on p.id = c.parent_id
    )
    select id, title, depth from chain where depth > 0 order by depth desc
  `)
  return rows.map((r) => ({ id: r.id, title: r.title }))
}

export async function pageLabels(db: Queryable, pageId: string): Promise<string[]> {
  const rows = await db.select({ name: t.pageLabels.name }).from(t.pageLabels).where(eq(t.pageLabels.pageId, pageId)).orderBy(asc(t.pageLabels.name))
  return rows.map((r) => r.name)
}

/** Ids of the page and every descendant. */
export async function subtreeIds(db: Queryable, pageId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    with recursive sub(id) as (
      select id from pages where id = ${pageId}
      union all
      select p.id from pages p join sub s on p.parent_id = s.id
    )
    select id from sub
  `)
  return rows.map((r) => r.id)
}

export async function toPageDto(db: Queryable, subject: Subject, ctx: PageContext): Promise<PageDto> {
  const { page, access } = ctx
  const [ancestors, draft, restriction, star, watch, labels] = await Promise.all([
    ancestorsOf(db, page.id),
    access.edit ? db.select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, page.id)) : [],
    db.select({ pageId: t.pageRestrictions.pageId }).from(t.pageRestrictions).where(eq(t.pageRestrictions.pageId, page.id)).limit(1),
    db.select().from(t.pageStars).where(and(eq(t.pageStars.pageId, page.id), eq(t.pageStars.userId, subject.userId))),
    db.select().from(t.pageWatches).where(and(eq(t.pageWatches.pageId, page.id), eq(t.pageWatches.userId, subject.userId))),
    pageLabels(db, page.id),
  ])
  const d = draft[0]
  return {
    id: page.id,
    spaceId: page.spaceId,
    spaceKey: ctx.space.space.key,
    parentId: page.parentId,
    ancestors,
    title: page.title,
    icon: page.icon,
    status: page.status,
    ownerId: page.ownerId,
    updatedById: page.updatedById,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    publishedHtml: page.publishedHtml,
    publishedVersion: page.publishedVersion,
    lockVersion: page.lockVersion,
    wordCount: page.wordCount,
    widthMode: page.widthMode,
    isBlogPost: page.isBlogPost,
    labels,
    restricted: restriction.length > 0,
    starred: star.length > 0,
    watched: watch.length > 0,
    draft: d ? { html: d.html, rev: d.rev, updatedAt: d.updatedAt.toISOString(), updatedById: d.updatedById } : null,
    myAccess: access,
  }
}

/**
 * One level of the tree the subject can see: children of `parentId`, or the top level when null.
 * `trash` lists archived and deleted pages whose parent is not itself in the trash.
 */
export async function treeLevel(db: Queryable, subject: Subject, spaceId: string, parentId: string | null, trash = false): Promise<PageNodeDto[]> {
  const statusFilter = trash
    ? and(
        inArray(t.pages.status, ['archived', 'deleted']),
        sql`not exists (select 1 from pages parent where parent.id = ${t.pages.parentId} and parent.status in ('archived', 'deleted'))`,
      )
    : and(inArray(t.pages.status, [...LIVE]), parentId === null ? isNull(t.pages.parentId) : eq(t.pages.parentId, parentId))
  const rows = await db
    .select({
      id: t.pages.id,
      parentId: t.pages.parentId,
      title: t.pages.title,
      icon: t.pages.icon,
      status: t.pages.status,
      hasDraft: sql<boolean>`exists (select 1 from page_drafts d where d.page_id = ${t.pages.id})`,
      restricted: sql<boolean>`exists (select 1 from page_restrictions r where r.page_id = ${t.pages.id})`,
    })
    .from(t.pages)
    .where(and(eq(t.pages.spaceId, spaceId), statusFilter, visiblePagesSql(subject)))
    .orderBy(asc(t.pages.position), asc(t.pages.title))
  if (rows.length === 0) return []

  const withChildren = trash
    ? []
    : await db
        .selectDistinct({ parentId: t.pages.parentId })
        .from(t.pages)
        .where(
          and(
            inArray(
              t.pages.parentId,
              rows.map((r) => r.id),
            ),
            inArray(t.pages.status, [...LIVE]),
            visiblePagesSql(subject),
          ),
        )
  const parents = new Set(withChildren.map((r) => r.parentId))
  return rows.map((r) => ({ ...r, hasDraft: r.status === 'published' && r.hasDraft, hasChildren: parents.has(r.id) }))
}

/** A position that puts a page at `index` among the other live children of `parentId`. */
export async function positionAt(db: Queryable, spaceId: string, parentId: string | null, index: number, excludeId?: string): Promise<number> {
  const siblings = await db
    .select({ id: t.pages.id, position: t.pages.position })
    .from(t.pages)
    .where(and(eq(t.pages.spaceId, spaceId), parentId === null ? isNull(t.pages.parentId) : eq(t.pages.parentId, parentId), inArray(t.pages.status, [...LIVE])))
    .orderBy(asc(t.pages.position), asc(t.pages.title))
  const others = siblings.filter((s) => s.id !== excludeId)
  if (others.length === 0) return 1
  if (index <= 0) return others[0].position - 1
  if (index >= others.length) return others[others.length - 1].position + 1
  return (others[index - 1].position + others[index].position) / 2
}

/**
 * Resolve principals to display names. `strict` rejects ones that don't exist (input);
 * otherwise they are shown by id (stored rows left behind by a deleted group).
 */
export async function principalsWithNames(db: Queryable, refs: readonly PrincipalRef[], strict = true): Promise<PrincipalDto[]> {
  const userIds = [...new Set(refs.filter((r) => r.type === 'user').map((r) => r.id))]
  const groupIds = [...new Set(refs.filter((r) => r.type === 'group').map((r) => r.id))]
  const [people, groups] = await Promise.all([
    userIds.length ? db.select({ id: t.user.id, name: t.user.name }).from(t.user).where(inArray(t.user.id, userIds)) : [],
    groupIds.length ? db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).where(inArray(t.groups.id, groupIds)) : [],
  ])
  const names = new Map<string, string>([...people.map((p) => [`user:${p.id}`, p.name] as const), ...groups.map((g) => [`group:${g.id}`, g.name] as const)])
  const seen = new Set<string>()
  const out: PrincipalDto[] = []
  for (const r of refs) {
    const k = `${r.type}:${r.id}`
    if (seen.has(k)) continue
    seen.add(k)
    const name = names.get(k)
    if (name === undefined && strict) throw badRequest('unknown_principal', 'One or more people or groups do not exist')
    out.push({ type: r.type, id: r.id, name: name ?? r.id })
  }
  return out
}
