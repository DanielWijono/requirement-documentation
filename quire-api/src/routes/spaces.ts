import {
  ALL_PERMS,
  MEMBER_DEFAULT_PERMS,
  MEMBERS_GROUP_ID,
  SPACE_PERMISSIONS,
  spaceCreateSchema,
  spacePatchSchema,
  spacePermissionsSchema,
  type SpaceGrantDto,
  type SpacePermission,
} from '@quire/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../app.ts'
import type { Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { badRequest, conflict, isUniqueViolation, readJson } from '../lib/errors.ts'
import { requireUser, sessionSubject, sessionUser } from '../middleware/session.ts'
import { requireSpaceAdmin, spaceForSubject, visibleSpacesSql, type SpaceRow } from '../services/access.ts'
import { treeLevel } from '../services/pages.ts'
import { toSpaceDtos } from '../services/spaces.ts'

async function spaceDto(db: Queryable, subject: Awaited<ReturnType<typeof sessionSubject>>, space: SpaceRow) {
  const [dto] = await toSpaceDtos(db, subject, [space])
  return dto
}

async function grantDtos(db: Queryable, spaceId: string): Promise<SpaceGrantDto[]> {
  const rows = await db.select().from(t.spacePermissions).where(eq(t.spacePermissions.spaceId, spaceId))
  const userIds = rows.filter((r) => r.principalType === 'user').map((r) => r.principalId)
  const groupIds = rows.filter((r) => r.principalType === 'group').map((r) => r.principalId)
  const [people, groups] = await Promise.all([
    userIds.length ? db.select({ id: t.user.id, name: t.user.name }).from(t.user).where(inArray(t.user.id, userIds)) : [],
    groupIds.length ? db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).where(inArray(t.groups.id, groupIds)) : [],
  ])
  const names = new Map([...people, ...groups].map((p) => [p.id, p.name]))
  return rows
    .map((r) => ({
      principalType: r.principalType,
      principalId: r.principalId,
      name: names.get(r.principalId) ?? r.principalId,
      perms: SPACE_PERMISSIONS.filter((p) => r.perms.includes(p)),
    }))
    .sort((a, b) => (a.principalType === b.principalType ? a.name.localeCompare(b.name) : a.principalType === 'group' ? -1 : 1))
}

/** Star and watch share a shape: PUT turns it on, DELETE turns it off. */
function toggle(table: typeof t.spaceStars | typeof t.spaceWatches) {
  return new Hono<AppEnv>()
    .put('/', requireUser, async (c) => {
      const { space } = await spaceForSubject(c.var.db, await sessionSubject(c), c.req.param('key')!)
      await c.var.db.insert(table).values({ userId: sessionUser(c).id, spaceId: space.id }).onConflictDoNothing()
      return c.body(null, 204)
    })
    .delete('/', requireUser, async (c) => {
      const { space } = await spaceForSubject(c.var.db, await sessionSubject(c), c.req.param('key')!)
      await c.var.db.delete(table).where(and(eq(table.userId, sessionUser(c).id), eq(table.spaceId, space.id)))
      return c.body(null, 204)
    })
}

export const spaces = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => {
    const { db } = c.var
    const subject = await sessionSubject(c)
    const rows = await db.select().from(t.spaces).where(visibleSpacesSql(subject)).orderBy(asc(t.spaces.name), asc(t.spaces.key))
    return c.json(await toSpaceDtos(db, subject, rows))
  })

  // Anyone signed in may start a space; they own it and the members group gets the defaults.
  .post('/', requireUser, async (c) => {
    const { db } = c.var
    const input = await readJson(c.req, spaceCreateSchema)
    const me = sessionUser(c)
    try {
      const space = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.spaces)
          .values({ ...input, ownerId: me.id })
          .returning()
        await tx.insert(t.spacePermissions).values([
          { spaceId: row.id, principalType: 'user', principalId: me.id, perms: [...ALL_PERMS] },
          { spaceId: row.id, principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: [...MEMBER_DEFAULT_PERMS] },
        ])
        return row
      })
      return c.json(await spaceDto(db, await sessionSubject(c), space), 201)
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('key_taken', 'A space with that key already exists')
      throw err
    }
  })

  .get('/:key', requireUser, async (c) => {
    const subject = await sessionSubject(c)
    const { space } = await spaceForSubject(c.var.db, subject, c.req.param('key'))
    return c.json(await spaceDto(c.var.db, subject, space))
  })

  .patch('/:key', requireUser, async (c) => {
    const { db } = c.var
    const subject = await sessionSubject(c)
    const { space } = requireSpaceAdmin(await spaceForSubject(db, subject, c.req.param('key')))
    const input = await readJson(c.req, spacePatchSchema)
    try {
      const [row] = await db.update(t.spaces).set(input).where(eq(t.spaces.id, space.id)).returning()
      return c.json(await spaceDto(db, subject, row))
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('key_taken', 'A space with that key already exists')
      throw err
    }
  })

  .delete('/:key', requireUser, async (c) => {
    const { db } = c.var
    const { space } = requireSpaceAdmin(await spaceForSubject(db, await sessionSubject(c), c.req.param('key')))
    await db.delete(t.spaces).where(eq(t.spaces.id, space.id))
    return c.body(null, 204)
  })

  .post('/:key/archive', requireUser, async (c) => setArchived(c, true))
  .post('/:key/unarchive', requireUser, async (c) => setArchived(c, false))

  .get('/:key/permissions', requireUser, async (c) => {
    const { space } = requireSpaceAdmin(await spaceForSubject(c.var.db, await sessionSubject(c), c.req.param('key')))
    return c.json(await grantDtos(c.var.db, space.id))
  })

  /** Replace the whole matrix. Rows for the same principal merge; rows with no permissions are dropped. */
  .put('/:key/permissions', requireUser, async (c) => {
    const { db } = c.var
    const { space } = requireSpaceAdmin(await spaceForSubject(db, await sessionSubject(c), c.req.param('key')))
    const { grants } = await readJson(c.req, spacePermissionsSchema)

    const merged = new Map<string, { principalType: 'user' | 'group'; principalId: string; perms: Set<SpacePermission> }>()
    for (const g of grants) {
      const k = `${g.principalType}:${g.principalId}`
      const row = merged.get(k) ?? { principalType: g.principalType, principalId: g.principalId, perms: new Set() }
      for (const p of g.perms) row.perms.add(p)
      merged.set(k, row)
    }
    const rows = [...merged.values()].filter((r) => r.perms.size > 0)

    await db.transaction(async (tx) => {
      const userIds = rows.filter((r) => r.principalType === 'user').map((r) => r.principalId)
      const groupIds = rows.filter((r) => r.principalType === 'group').map((r) => r.principalId)
      const [people, groups] = await Promise.all([
        userIds.length ? tx.select({ id: t.user.id }).from(t.user).where(inArray(t.user.id, userIds)) : [],
        groupIds.length ? tx.select({ id: t.groups.id }).from(t.groups).where(inArray(t.groups.id, groupIds)) : [],
      ])
      if (people.length !== userIds.length || groups.length !== groupIds.length) {
        throw badRequest('unknown_principal', 'One or more people or groups do not exist')
      }
      await tx.delete(t.spacePermissions).where(eq(t.spacePermissions.spaceId, space.id))
      if (rows.length) {
        await tx.insert(t.spacePermissions).values(
          rows.map((r) => ({ spaceId: space.id, principalType: r.principalType, principalId: r.principalId, perms: SPACE_PERMISSIONS.filter((p) => r.perms.has(p)) })),
        )
      }
    })
    return c.json(await grantDtos(db, space.id))
  })

  /** One level of the page tree (`?parentId=`), or the roots of the trash (`?trash=1`). */
  .get('/:key/tree', requireUser, async (c) => {
    const subject = await sessionSubject(c)
    const { space } = await spaceForSubject(c.var.db, subject, c.req.param('key'))
    return c.json(await treeLevel(c.var.db, subject, space.id, c.req.query('parentId') || null, c.req.query('trash') === '1'))
  })

  .route('/:key/star', toggle(t.spaceStars))
  .route('/:key/watch', toggle(t.spaceWatches))

async function setArchived(c: Context<AppEnv>, archived: boolean) {
  const { db } = c.var
  const subject = await sessionSubject(c)
  const { space } = requireSpaceAdmin(await spaceForSubject(db, subject, c.req.param('key')!))
  const [row] = await db
    .update(t.spaces)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(t.spaces.id, space.id))
    .returning()
  return c.json(await spaceDto(db, subject, row))
}
