import { commentBodySchema, commentCreateSchema, type CommentDto } from '@quire/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../app.ts'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { badRequest, forbidden, notFound, readJson } from '../lib/errors.ts'
import { requireUser, sessionSubject, sessionUser } from '../middleware/session.ts'
import { pageForSubject } from '../services/access.ts'

type CommentRow = typeof t.comments.$inferSelect

function toDto(row: CommentRow, replies: CommentDto[] = []): CommentDto {
  const deleted = row.deletedAt !== null
  return {
    id: row.id,
    pageId: row.pageId,
    parentId: row.parentId,
    authorId: row.authorId,
    body: deleted ? '' : row.body,
    anchorText: deleted ? null : row.anchorText,
    resolved: row.resolvedAt !== null,
    edited: row.updatedAt.getTime() !== row.createdAt.getTime(),
    deleted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    replies,
  }
}

/**
 * Threads on a page, oldest first. Deleted replies disappear; a deleted top-level comment stays as a
 * placeholder while it still has replies.
 */
async function threads(db: Queryable, pageId: string): Promise<CommentDto[]> {
  const rows = await db.select().from(t.comments).where(eq(t.comments.pageId, pageId)).orderBy(asc(t.comments.createdAt), asc(t.comments.id))
  const replies = new Map<string, CommentDto[]>()
  for (const r of rows) {
    if (r.parentId && r.deletedAt === null) replies.set(r.parentId, [...(replies.get(r.parentId) ?? []), toDto(r)])
  }
  return rows.filter((r) => r.parentId === null && (r.deletedAt === null || replies.has(r.id))).map((r) => toDto(r, replies.get(r.id)))
}

/** The comment (not deleted) and the page it is on, checked for the subject. */
async function loadComment(c: Context<AppEnv>) {
  const { db } = c.var
  const [row] = await db
    .select()
    .from(t.comments)
    .where(and(eq(t.comments.id, c.req.param('id')!), isNull(t.comments.deletedAt)))
  if (!row) throw notFound('Comment')
  const subject = await sessionSubject(c)
  return { row, page: await pageForSubject(db, subject, row.pageId) }
}

export const pageComments = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => {
    const page = await pageForSubject(c.var.db, await sessionSubject(c), c.req.param('id')!)
    return c.json(await threads(c.var.db, page.page.id))
  })

  .post('/', requireUser, async (c) => {
    const { db } = c.var
    const page = await pageForSubject(db, await sessionSubject(c), c.req.param('id')!)
    if (!page.access.comment) throw forbidden('You cannot comment on this page')
    const input = await readJson(c.req, commentCreateSchema)
    const [row] = await db
      .insert(t.comments)
      .values({ pageId: page.page.id, authorId: sessionUser(c).id, ...input })
      .returning()
    return c.json(toDto(row), 201)
  })

export const comments = new Hono<AppEnv>()
  /** Replying to a reply joins the same thread: threads are one level deep. */
  .post('/:id/replies', requireUser, async (c) => {
    const { db } = c.var
    const { row, page } = await loadComment(c)
    if (!page.access.comment) throw forbidden('You cannot comment on this page')
    const { body } = await readJson(c.req, commentBodySchema)
    const [reply] = await db
      .insert(t.comments)
      .values({ pageId: row.pageId, parentId: row.parentId ?? row.id, authorId: sessionUser(c).id, body })
      .returning()
    return c.json(toDto(reply), 201)
  })

  .patch('/:id', requireUser, async (c) => {
    const { db } = c.var
    const { row } = await loadComment(c)
    if (row.authorId !== sessionUser(c).id) throw forbidden('Only the author can edit a comment')
    const { body } = await readJson(c.req, commentBodySchema)
    const [updated] = await db.update(t.comments).set({ body, updatedAt: new Date() }).where(eq(t.comments.id, row.id)).returning()
    return c.json(toDto(updated))
  })

  /** Authors and space admins may delete. The row stays so replies keep their thread. */
  .delete('/:id', requireUser, async (c) => {
    const { row, page } = await loadComment(c)
    if (row.authorId !== sessionUser(c).id && !page.space.access.admin) throw forbidden('Only the author or a space admin can delete a comment')
    await c.var.db.update(t.comments).set({ deletedAt: new Date() }).where(eq(t.comments.id, row.id))
    return c.body(null, 204)
  })

  .post('/:id/resolve', requireUser, async (c) => setResolved(c, true))
  .post('/:id/reopen', requireUser, async (c) => setResolved(c, false))

async function setResolved(c: Context<AppEnv>, resolved: boolean) {
  const { row, page } = await loadComment(c)
  if (row.parentId) throw badRequest('reply', 'Resolve the thread, not a reply')
  if (!page.access.comment) throw forbidden('You cannot comment on this page')
  const [updated] = await c.var.db
    .update(t.comments)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(eq(t.comments.id, row.id))
    .returning()
  return c.json(toDto(updated, (await threads(c.var.db, row.pageId)).find((th) => th.id === row.id)?.replies))
}
