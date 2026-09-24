import type { LabelCountDto, PageItemDto, StarredDto } from '@quire/shared'
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app.ts'
import * as t from '../db/schema.ts'
import { requireUser, sessionSubject, sessionUser } from '../middleware/session.ts'
import { visiblePagesSql, visibleSpacesSql } from '../services/access.ts'
import { toSpaceDtos } from '../services/spaces.ts'

const itemColumns = {
  id: t.pages.id,
  title: t.pages.title,
  icon: t.pages.icon,
  status: t.pages.status,
  hasDraft: sql<boolean>`exists (select 1 from page_drafts d where d.page_id = ${t.pages.id})`,
  spaceKey: t.spaces.key,
  spaceName: t.spaces.name,
  updatedAt: t.pages.updatedAt,
  updatedById: t.pages.updatedById,
}

interface ItemRow extends Omit<PageItemDto, 'updatedAt' | 'viewedAt'> {
  updatedAt: Date
  viewedAt?: Date
}

function toItem(row: ItemRow): PageItemDto {
  return {
    ...row,
    hasDraft: row.status === 'published' && row.hasDraft,
    updatedAt: row.updatedAt.toISOString(),
    viewedAt: row.viewedAt ? row.viewedAt.toISOString() : null,
  }
}

const live = inArray(t.pages.status, ['draft', 'published'])
const LIMIT = 20

/** Home lists for the signed-in person. Mounted next to `GET /me`. */
export const home = new Hono<AppEnv>()
  .get('/recent', requireUser, async (c) => {
    const subject = await sessionSubject(c)
    const rows = await c.var.db
      .select({ ...itemColumns, viewedAt: t.recentViews.viewedAt })
      .from(t.recentViews)
      .innerJoin(t.pages, eq(t.pages.id, t.recentViews.pageId))
      .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
      .where(and(eq(t.recentViews.userId, subject.userId), live, visiblePagesSql(subject)))
      .orderBy(desc(t.recentViews.viewedAt))
      .limit(LIMIT)
    return c.json(rows.map(toItem))
  })

  .get('/starred', requireUser, async (c) => {
    const { db } = c.var
    const subject = await sessionSubject(c)
    const [spaces, pages] = await Promise.all([
      db
        .select({ space: t.spaces })
        .from(t.spaceStars)
        .innerJoin(t.spaces, eq(t.spaces.id, t.spaceStars.spaceId))
        .where(and(eq(t.spaceStars.userId, subject.userId), visibleSpacesSql(subject)))
        .orderBy(asc(t.spaces.name)),
      db
        .select(itemColumns)
        .from(t.pageStars)
        .innerJoin(t.pages, eq(t.pages.id, t.pageStars.pageId))
        .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
        .where(and(eq(t.pageStars.userId, subject.userId), live, visiblePagesSql(subject)))
        .orderBy(desc(t.pageStars.createdAt)),
    ])
    const dto: StarredDto = { spaces: await toSpaceDtos(db, subject, spaces.map((s) => s.space)), pages: pages.map(toItem) }
    return c.json(dto)
  })

  /** Pages the person has not published yet, plus published pages where they saved the latest draft. */
  .get('/drafts', requireUser, async (c) => {
    const subject = await sessionSubject(c)
    const me = sessionUser(c).id
    const mine: SQL = or(
      and(eq(t.pages.status, 'draft'), eq(t.pages.ownerId, me)),
      and(eq(t.pages.status, 'published'), eq(t.pageDrafts.updatedById, me)),
    )!
    const rows = await c.var.db
      .select(itemColumns)
      .from(t.pages)
      .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
      .leftJoin(t.pageDrafts, eq(t.pageDrafts.pageId, t.pages.id))
      .where(and(mine, visiblePagesSql(subject)))
      .orderBy(desc(sql`coalesce(${t.pageDrafts.updatedAt}, ${t.pages.updatedAt})`))
      .limit(LIMIT)
    return c.json(rows.map(toItem))
  })

/** `GET /labels?q=`: labels on pages the person can see, most used first. */
export const labels = new Hono<AppEnv>().get('/', requireUser, async (c) => {
  const subject = await sessionSubject(c)
  const q = c.req.query('q')?.trim().toLowerCase()
  const pattern = q ? `${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : undefined
  const rows = await c.var.db
    .select({ name: t.pageLabels.name, count: count() })
    .from(t.pageLabels)
    .innerJoin(t.pages, eq(t.pages.id, t.pageLabels.pageId))
    .where(and(live, visiblePagesSql(subject), pattern ? ilike(t.pageLabels.name, pattern) : undefined))
    .groupBy(t.pageLabels.name)
    .orderBy(desc(count()), asc(t.pageLabels.name))
    .limit(LIMIT)
  return c.json(rows satisfies LabelCountDto[])
})
