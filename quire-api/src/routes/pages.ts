import {
  collaboratorsSchema,
  draftSaveSchema,
  labelsSchema,
  pageCopySchema,
  pageCreateSchema,
  pageMoveSchema,
  pagePatchSchema,
  pageRestrictionsSchema,
  publishSchema,
  type PageRestrictionsDto,
  type PageVersionDetailDto,
  type PageVersionDto,
  type PrincipalRef,
  type Subject,
} from '@quire/shared'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../app.ts'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { ApiError, badRequest, conflict, forbidden, ifMatchVersion, notFound, readJson, requireIfMatch } from '../lib/errors.ts'
import { countWords, htmlToText } from '../lib/html.ts'
import { sanitizeBody } from '../lib/sanitize.ts'
import { requireUser, sessionSubject, sessionUser } from '../middleware/session.ts'
import { pageForSubject, spaceForSubject, type PageContext } from '../services/access.ts'
import { pageLabels, principalsWithNames, positionAt, subtreeIds, toPageDto } from '../services/pages.ts'
import { pageComments } from './comments.ts'
import { toUserDto, userColumns } from '../services/users.ts'

type C = Context<AppEnv>

async function load(c: C, id = c.req.param('id')!) {
  const subject = await sessionSubject(c)
  return { subject, ctx: await pageForSubject(c.var.db, subject, id) }
}

async function pageJson(c: C, subject: Subject, id: string, status: 200 | 201 = 200) {
  const dto = await toPageDto(c.var.db, subject, await pageForSubject(c.var.db, subject, id))
  c.header('ETag', `"${dto.lockVersion}"`)
  return c.json(dto, status)
}

function need(allowed: boolean, message: string) {
  if (!allowed) throw forbidden(message)
}

async function touchSpace(db: Queryable, spaceId: string) {
  await db.update(t.spaces).set({ lastActivityAt: new Date() }).where(eq(t.spaces.id, spaceId))
}

/** Where a new or moved page may go: the top of a space (Add) or under a page the subject can add to. */
async function destination(db: Queryable, subject: Subject, spaceKey: string, parentId: string | null) {
  const space = await spaceForSubject(db, subject, spaceKey)
  if (parentId === null) {
    need(space.access.addPage, 'You cannot add pages to this space')
    return { space, parent: null }
  }
  const parent = await pageForSubject(db, subject, parentId).catch((err: unknown) => {
    // A parent the subject can't see is reported like a missing one.
    if (err instanceof ApiError && err.status === 403) throw badRequest('invalid_parent', 'The parent page does not exist')
    throw err
  })
  if (parent.page.spaceId !== space.space.id) throw badRequest('cross_space', 'Pages can only be placed under a page in the same space')
  if (parent.page.status === 'archived' || parent.page.status === 'deleted') throw badRequest('invalid_parent', 'The parent page is in the trash')
  need(parent.access.addChild, 'You cannot add pages under that page')
  return { space, parent }
}

async function restrictionsDto(db: Queryable, ctx: PageContext): Promise<PageRestrictionsDto> {
  const rows = await db.execute<{ page_id: string; title: string; kind: 'view' | 'edit'; principal_type: 'user' | 'group'; principal_id: string; depth: number }>(sql`
    with recursive chain(id, parent_id, title, depth) as (
      select id, parent_id, title, 0 from pages where id = ${ctx.page.id}
      union all
      select p.id, p.parent_id, p.title, c.depth + 1 from pages p join chain c on p.id = c.parent_id
    )
    select c.id as page_id, c.title, r.kind, r.principal_type, r.principal_id, c.depth
    from chain c join page_restrictions r on r.page_id = c.id
    where r.kind = 'view' or c.depth = 0
    order by c.depth, r.principal_type, r.principal_id
  `)
  const refs = (filter: (r: (typeof rows)[number]) => boolean) => rows.filter(filter).map((r): PrincipalRef => ({ type: r.principal_type, id: r.principal_id }))
  const inheritedIds = [...new Set(rows.filter((r) => r.depth > 0).map((r) => r.page_id))]
  return {
    view: await principalsWithNames(db, refs((r) => r.depth === 0 && r.kind === 'view'), false),
    edit: await principalsWithNames(db, refs((r) => r.depth === 0 && r.kind === 'edit'), false),
    inherited: await Promise.all(
      inheritedIds.map(async (pageId) => ({
        pageId,
        title: rows.find((r) => r.page_id === pageId)!.title,
        view: await principalsWithNames(db, refs((r) => r.page_id === pageId), false),
      })),
    ),
  }
}

/** Publish `html` as the next version, provided the page is still at `lockVersion`. */
async function publishHtml(db: Queryable, ctx: PageContext, userId: string, lockVersion: number, html: string, comment: string, draftRev: number | null) {
  const text = htmlToText(html)
  const now = new Date()
  const [updated] = await db
    .update(t.pages)
    .set({
      status: 'published',
      publishedHtml: html,
      bodyText: text,
      wordCount: countWords(text),
      publishedVersion: sql`${t.pages.publishedVersion} + 1`,
      lockVersion: sql`${t.pages.lockVersion} + 1`,
      updatedById: userId,
      updatedAt: now,
      ...(ctx.page.status !== 'published' ? { statusChangedAt: now } : {}),
    })
    .where(and(eq(t.pages.id, ctx.page.id), eq(t.pages.lockVersion, lockVersion), inArray(t.pages.status, ['draft', 'published'])))
    .returning()
  if (!updated) return false
  await db.insert(t.pageVersions).values({ pageId: updated.id, version: updated.publishedVersion, html, title: updated.title, authorId: userId, comment })
  // Keep a draft someone saved after the one being published.
  if (draftRev !== null) await db.delete(t.pageDrafts).where(and(eq(t.pageDrafts.pageId, updated.id), eq(t.pageDrafts.rev, draftRev)))
  await touchSpace(db, updated.spaceId)
  return true
}

/** Star and watch share a shape: PUT turns it on, DELETE turns it off. */
function toggle(table: typeof t.pageStars | typeof t.pageWatches) {
  return new Hono<AppEnv>()
    .put('/', requireUser, async (c) => {
      const { ctx } = await load(c)
      await c.var.db.insert(table).values({ userId: sessionUser(c).id, pageId: ctx.page.id }).onConflictDoNothing()
      return c.body(null, 204)
    })
    .delete('/', requireUser, async (c) => {
      const { ctx } = await load(c)
      await c.var.db.delete(table).where(and(eq(table.userId, sessionUser(c).id), eq(table.pageId, ctx.page.id)))
      return c.body(null, 204)
    })
}

export const pages = new Hono<AppEnv>()
  .post('/', requireUser, async (c) => {
    const { db } = c.var
    const subject = await sessionSubject(c)
    const input = await readJson(c.req, pageCreateSchema)
    const { space } = await destination(db, subject, input.spaceKey, input.parentId)
    const me = sessionUser(c)
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.pages)
        .values({
          spaceId: space.space.id,
          parentId: input.parentId,
          position: await positionAt(tx, space.space.id, input.parentId, Number.MAX_SAFE_INTEGER),
          title: input.title,
          icon: input.icon,
          isBlogPost: input.isBlogPost,
          status: 'draft',
          ownerId: me.id,
          updatedById: me.id,
        })
        .returning({ id: t.pages.id })
      await tx.insert(t.pageDrafts).values({ pageId: row.id, html: sanitizeBody(input.html), updatedById: me.id })
      await touchSpace(tx, space.space.id)
      return row.id
    })
    return pageJson(c, subject, id, 201)
  })

  .get('/:id', requireUser, async (c) => {
    const { subject, ctx } = await load(c)
    return pageJson(c, subject, ctx.page.id)
  })

  .patch('/:id', requireUser, async (c) => {
    const { db } = c.var
    const { subject, ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const expected = ifMatchVersion(c.req.header('if-match'))
    const input = await readJson(c.req, pagePatchSchema)
    const [row] = await db
      .update(t.pages)
      .set({ ...input, lockVersion: sql`${t.pages.lockVersion} + 1`, updatedById: sessionUser(c).id, updatedAt: new Date() })
      .where(and(eq(t.pages.id, ctx.page.id), expected === null ? undefined : eq(t.pages.lockVersion, expected)))
      .returning({ id: t.pages.id })
    if (!row) throw conflict('page_conflict', 'Someone else changed this page', { current: await toPageDto(db, subject, await pageForSubject(db, subject, ctx.page.id)) })
    return pageJson(c, subject, row.id)
  })

  // Drafts: the working copy, saved often. If-Match carries the draft rev the client last saw.
  .put('/:id/draft', requireUser, async (c) => {
    const { db } = c.var
    const { ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const expected = ifMatchVersion(c.req.header('if-match'))
    const { html } = await readJson(c.req, draftSaveSchema)
    const me = sessionUser(c)
    const clean = sanitizeBody(html)
    const now = new Date()
    const [saved] =
      expected === null
        ? await db.insert(t.pageDrafts).values({ pageId: ctx.page.id, html: clean, updatedById: me.id, updatedAt: now }).onConflictDoNothing().returning()
        : await db
            .update(t.pageDrafts)
            // A plain save makes the HTML the source again; the next co-editing session starts from it.
            .set({ html: clean, rev: sql`${t.pageDrafts.rev} + 1`, ystate: null, updatedById: me.id, updatedAt: now })
            .where(and(eq(t.pageDrafts.pageId, ctx.page.id), eq(t.pageDrafts.rev, expected)))
            .returning()
    if (!saved) {
      const [current] = await db.select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, ctx.page.id))
      throw conflict('draft_conflict', 'Someone else saved this draft', {
        current: current ? { html: current.html, rev: current.rev, updatedAt: current.updatedAt.toISOString(), updatedById: current.updatedById } : null,
      })
    }
    c.header('ETag', `"${saved.rev}"`)
    return c.json({ html: saved.html, rev: saved.rev, updatedAt: saved.updatedAt.toISOString(), updatedById: saved.updatedById })
  })

  .delete('/:id/draft', requireUser, async (c) => {
    const { ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    if (ctx.page.status === 'draft') throw badRequest('unpublished', 'A page that was never published has no other version to go back to')
    await c.var.db.delete(t.pageDrafts).where(eq(t.pageDrafts.pageId, ctx.page.id))
    c.var.collab.replace(ctx.page.id, ctx.page.publishedHtml ?? '<p></p>')
    c.var.collab.notify(ctx.page.id, { type: 'discarded', byUserId: sessionUser(c).id })
    return c.body(null, 204)
  })

  .post('/:id/publish', requireUser, async (c) => {
    const { db } = c.var
    const { subject, ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const lockVersion = requireIfMatch(c.req.header('if-match'))
    const { comment } = await readJson(c.req, publishSchema)
    // Publish what co-editors see now, not what the last debounced save wrote.
    await c.var.collab.flush(ctx.page.id)
    const [draft] = await db.select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, ctx.page.id))
    if (!draft) throw badRequest('nothing_to_publish', 'There are no changes to publish')
    const ok = await db.transaction((tx) => publishHtml(tx, ctx, sessionUser(c).id, lockVersion, draft.html, comment, draft.rev))
    if (!ok) throw conflict('page_conflict', 'Someone else published this page', { current: await toPageDto(db, subject, await pageForSubject(db, subject, ctx.page.id)) })
    c.var.collab.notify(ctx.page.id, { type: 'published', byUserId: sessionUser(c).id })
    return pageJson(c, subject, ctx.page.id)
  })

  .get('/:id/versions', requireUser, async (c) => {
    const { ctx } = await load(c)
    const rows = await c.var.db
      .select({ version: t.pageVersions.version, title: t.pageVersions.title, authorId: t.pageVersions.authorId, comment: t.pageVersions.comment, createdAt: t.pageVersions.createdAt })
      .from(t.pageVersions)
      .where(eq(t.pageVersions.pageId, ctx.page.id))
      .orderBy(desc(t.pageVersions.version))
    return c.json(rows.map((r): PageVersionDto => ({ ...r, createdAt: r.createdAt.toISOString() })))
  })

  .get('/:id/versions/:version', requireUser, async (c) => {
    const { ctx } = await load(c)
    const [row] = await c.var.db
      .select()
      .from(t.pageVersions)
      .where(and(eq(t.pageVersions.pageId, ctx.page.id), eq(t.pageVersions.version, Number(c.req.param('version')) || -1)))
    if (!row) throw notFound('Version')
    const dto: PageVersionDetailDto = { version: row.version, title: row.title, authorId: row.authorId, comment: row.comment, createdAt: row.createdAt.toISOString(), html: row.html }
    return c.json(dto)
  })

  .post('/:id/versions/:version/restore', requireUser, async (c) => {
    const { db } = c.var
    const { subject, ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const lockVersion = requireIfMatch(c.req.header('if-match'))
    const [row] = await db
      .select()
      .from(t.pageVersions)
      .where(and(eq(t.pageVersions.pageId, ctx.page.id), eq(t.pageVersions.version, Number(c.req.param('version')) || -1)))
    if (!row) throw notFound('Version')
    if (row.html === null) throw badRequest('version_unavailable', 'That version has no saved content to restore')
    const html = row.html
    const ok = await db.transaction((tx) => publishHtml(tx, ctx, sessionUser(c).id, lockVersion, html, `Restored version ${row.version}`, null))
    if (!ok) throw conflict('page_conflict', 'Someone else published this page', { current: await toPageDto(db, subject, await pageForSubject(db, subject, ctx.page.id)) })
    // Open editors now hold the restored version rather than writing the old draft back over it.
    await db.delete(t.pageDrafts).where(eq(t.pageDrafts.pageId, ctx.page.id))
    c.var.collab.replace(ctx.page.id, html)
    c.var.collab.notify(ctx.page.id, { type: 'published', byUserId: sessionUser(c).id })
    return pageJson(c, subject, ctx.page.id)
  })

  .post('/:id/move', requireUser, async (c) => {
    const { db } = c.var
    const { subject, ctx } = await load(c)
    if (ctx.page.status === 'archived' || ctx.page.status === 'deleted') throw badRequest('in_trash', 'Restore the page before moving it')
    need(ctx.access.edit, 'You cannot move this page')
    const { parentId, index } = await readJson(c.req, pageMoveSchema)
    if (parentId !== null && (await subtreeIds(db, ctx.page.id)).includes(parentId)) throw badRequest('move_cycle', 'A page cannot move below itself')
    await destination(db, subject, ctx.space.space.key, parentId)
    await db
      .update(t.pages)
      .set({
        parentId,
        position: await positionAt(db, ctx.page.spaceId, parentId, index, ctx.page.id),
        lockVersion: sql`${t.pages.lockVersion} + 1`,
      })
      .where(eq(t.pages.id, ctx.page.id))
    c.var.collab.notify(ctx.page.id, { type: 'moved', byUserId: sessionUser(c).id })
    return pageJson(c, subject, ctx.page.id)
  })

  .post('/:id/copy', requireUser, async (c) => {
    const { db } = c.var
    const { subject, ctx } = await load(c)
    const input = await readJson(c.req, pageCopySchema)
    const { space } = await destination(db, subject, ctx.space.space.key, ctx.page.parentId)
    const [draft] = ctx.access.edit ? await db.select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, ctx.page.id)) : []
    const html = draft?.html ?? ctx.page.publishedHtml ?? '<p></p>'
    const me = sessionUser(c)
    const siblings = await db
      .select({ id: t.pages.id })
      .from(t.pages)
      .where(and(eq(t.pages.spaceId, ctx.page.spaceId), ctx.page.parentId === null ? isNull(t.pages.parentId) : eq(t.pages.parentId, ctx.page.parentId), inArray(t.pages.status, ['draft', 'published'])))
      .orderBy(asc(t.pages.position), asc(t.pages.title))
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.pages)
        .values({
          spaceId: space.space.id,
          parentId: ctx.page.parentId,
          position: await positionAt(tx, ctx.page.spaceId, ctx.page.parentId, siblings.findIndex((s) => s.id === ctx.page.id) + 1),
          title: input.title ?? `Copy of ${ctx.page.title}`,
          icon: ctx.page.icon,
          widthMode: ctx.page.widthMode,
          isBlogPost: ctx.page.isBlogPost,
          status: 'draft',
          ownerId: me.id,
          updatedById: me.id,
        })
        .returning({ id: t.pages.id })
      await tx.insert(t.pageDrafts).values({ pageId: row.id, html, updatedById: me.id })
      return row.id
    })
    return pageJson(c, subject, id, 201)
  })

  // Trash: archive, delete and restore act on the whole subtree.
  .post('/:id/archive', requireUser, async (c) => trash(c, 'archive'))
  .post('/:id/delete', requireUser, async (c) => trash(c, 'delete'))
  .post('/:id/restore', requireUser, async (c) => trash(c, 'restore'))

  .get('/:id/restrictions', requireUser, async (c) => {
    const { ctx } = await load(c)
    return c.json(await restrictionsDto(c.var.db, ctx))
  })

  /** Replace this page's own lists. Whoever sets a non-empty list is always kept on it. */
  .put('/:id/restrictions', requireUser, async (c) => {
    const { db } = c.var
    const { ctx } = await load(c)
    need(ctx.access.restrict, 'You cannot change restrictions on this page')
    const input = await readJson(c.req, pageRestrictionsSchema)
    const me: PrincipalRef = { type: 'user', id: sessionUser(c).id }
    const withMe = (list: PrincipalRef[]) => (list.length ? [me, ...list] : list)
    const [view, edit] = [await principalsWithNames(db, withMe(input.view)), await principalsWithNames(db, withMe(input.edit))]
    await db.transaction(async (tx) => {
      await tx.delete(t.pageRestrictions).where(eq(t.pageRestrictions.pageId, ctx.page.id))
      const rows = [
        ...view.map((p) => ({ pageId: ctx.page.id, kind: 'view' as const, principalType: p.type, principalId: p.id })),
        ...edit.map((p) => ({ pageId: ctx.page.id, kind: 'edit' as const, principalType: p.type, principalId: p.id })),
      ]
      if (rows.length) await tx.insert(t.pageRestrictions).values(rows)
    })
    // Editors reconnect and are checked again; anyone who lost edit access drops out.
    for (const id of await subtreeIds(db, ctx.page.id)) c.var.collab.recheck(id)
    return c.json(await restrictionsDto(db, ctx))
  })

  .get('/:id/collaborators', requireUser, async (c) => {
    const { ctx } = await load(c)
    return c.json(await collaborators(c.var.db, ctx.page.id))
  })

  .put('/:id/collaborators', requireUser, async (c) => {
    const { db } = c.var
    const { ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const userIds = [...new Set((await readJson(c.req, collaboratorsSchema)).userIds)]
    await db.transaction(async (tx) => {
      if (userIds.length) {
        const known = await tx
          .select({ id: t.user.id })
          .from(t.user)
          .where(and(inArray(t.user.id, userIds), isNull(t.user.deactivatedAt)))
        if (known.length !== userIds.length) throw badRequest('unknown_user', 'One or more people do not exist')
      }
      await tx.delete(t.pageCollaborators).where(eq(t.pageCollaborators.pageId, ctx.page.id))
      if (userIds.length) await tx.insert(t.pageCollaborators).values(userIds.map((userId) => ({ pageId: ctx.page.id, userId })))
    })
    return c.json(await collaborators(db, ctx.page.id))
  })

  /** Replace the page's labels. */
  .put('/:id/labels', requireUser, async (c) => {
    const { db } = c.var
    const { ctx } = await load(c)
    need(ctx.access.edit, 'You cannot edit this page')
    const labels = [...new Set((await readJson(c.req, labelsSchema)).labels)]
    await db.transaction(async (tx) => {
      await tx.delete(t.pageLabels).where(eq(t.pageLabels.pageId, ctx.page.id))
      if (labels.length) await tx.insert(t.pageLabels).values(labels.map((name) => ({ pageId: ctx.page.id, name })))
    })
    return c.json(await pageLabels(db, ctx.page.id))
  })

  /** Record that the person opened the page, for their recent list. */
  .post('/:id/views', requireUser, async (c) => {
    const { ctx } = await load(c)
    const viewedAt = new Date()
    await c.var.db
      .insert(t.recentViews)
      .values({ userId: sessionUser(c).id, pageId: ctx.page.id, viewedAt })
      .onConflictDoUpdate({ target: [t.recentViews.userId, t.recentViews.pageId], set: { viewedAt } })
    return c.body(null, 204)
  })

  .route('/:id/comments', pageComments)
  .route('/:id/star', toggle(t.pageStars))
  .route('/:id/watch', toggle(t.pageWatches))

async function collaborators(db: Queryable, pageId: string) {
  const rows = await db
    .select(userColumns)
    .from(t.pageCollaborators)
    .innerJoin(t.user, eq(t.user.id, t.pageCollaborators.userId))
    .where(eq(t.pageCollaborators.pageId, pageId))
    .orderBy(asc(t.user.name))
  return rows.map(toUserDto)
}

async function trash(c: C, action: 'archive' | 'delete' | 'restore'): Promise<Response> {
  const { db } = c.var
  const { subject, ctx } = await load(c)
  need(ctx.access.delete, 'You cannot archive or delete this page')
  const inTrash = ctx.page.status === 'archived' || ctx.page.status === 'deleted'
  if (action === 'restore' && !inTrash) throw badRequest('not_in_trash', 'This page is not in the trash')
  if (action === 'archive' && inTrash) throw badRequest('in_trash', 'This page is already in the trash')
  if (action === 'delete' && ctx.page.status === 'deleted') throw badRequest('in_trash', 'This page is already deleted')

  const ids = await subtreeIds(db, ctx.page.id)
  const now = new Date()
  const bump = { lockVersion: sql`${t.pages.lockVersion} + 1`, statusChangedAt: now }
  await db.transaction(async (tx) => {
    if (action === 'archive' || action === 'delete') {
      const status = action === 'archive' ? 'archived' : 'deleted'
      await tx
        .update(t.pages)
        .set({ status, statusBeforeTrash: sql`${t.pages.status}`, ...bump })
        .where(and(inArray(t.pages.id, ids), inArray(t.pages.status, ['draft', 'published'])))
      if (action === 'delete') {
        await tx
          .update(t.pages)
          .set({ status, ...bump })
          .where(and(inArray(t.pages.id, ids), eq(t.pages.status, 'archived')))
      }
      return
    }
    await tx
      .update(t.pages)
      .set({ status: sql`coalesce(${t.pages.statusBeforeTrash}, 'published')`, statusBeforeTrash: null, ...bump })
      .where(and(inArray(t.pages.id, ids), inArray(t.pages.status, ['archived', 'deleted'])))
    // A page whose parent is still in the trash comes back at the top of the space.
    if (ctx.page.parentId) {
      const [parent] = await tx.select({ status: t.pages.status }).from(t.pages).where(eq(t.pages.id, ctx.page.parentId))
      if (parent.status === 'archived' || parent.status === 'deleted') {
        await tx
          .update(t.pages)
          .set({ parentId: null, position: await positionAt(tx, ctx.page.spaceId, null, Number.MAX_SAFE_INTEGER, ctx.page.id) })
          .where(eq(t.pages.id, ctx.page.id))
      }
    }
  })
  const event = action === 'restore' ? 'restored' : action === 'archive' ? 'archived' : 'deleted'
  for (const id of ids) c.var.collab.notify(id, { type: event, byUserId: sessionUser(c).id })
  return pageJson(c, subject, ctx.page.id)
}

