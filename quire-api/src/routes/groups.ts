import { groupInputSchema, groupMembersSchema, groupPatchSchema, MEMBERS_GROUP_ID, type GroupDetailDto, type GroupDto } from '@quire/shared'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app.ts'
import type { Db } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { badRequest, conflict, isUniqueViolation, notFound, readJson } from '../lib/errors.ts'
import { requireAdmin, requireUser } from '../middleware/session.ts'
import { toUserDto, userColumns } from '../services/users.ts'

async function activeUserCount(db: Db) {
  const [row] = await db.select({ n: count() }).from(t.user).where(isNull(t.user.deactivatedAt))
  return row.n
}

async function loadGroup(db: Db, id: string) {
  const [row] = await db.select().from(t.groups).where(eq(t.groups.id, id))
  if (!row) throw notFound('Group')
  return row
}

function editable(group: typeof t.groups.$inferSelect) {
  if (group.isSystem) throw badRequest('system_group', 'The All members group is managed automatically')
  return group
}

async function detail(db: Db, group: typeof t.groups.$inferSelect): Promise<GroupDetailDto> {
  const members = group.isSystem
    ? await db.select(userColumns).from(t.user).where(isNull(t.user.deactivatedAt)).orderBy(asc(t.user.name))
    : await db
        .select(userColumns)
        .from(t.groupMembers)
        .innerJoin(t.user, eq(t.user.id, t.groupMembers.userId))
        .where(and(eq(t.groupMembers.groupId, group.id), isNull(t.user.deactivatedAt)))
        .orderBy(asc(t.user.name))
  return { id: group.id, name: group.name, description: group.description, isSystem: group.isSystem, memberCount: members.length, members: members.map(toUserDto) }
}

export const groups = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => {
    const { db } = c.var
    const rows = await db
      .select({ id: t.groups.id, name: t.groups.name, description: t.groups.description, isSystem: t.groups.isSystem, memberCount: count(t.user.id) })
      .from(t.groups)
      .leftJoin(t.groupMembers, eq(t.groupMembers.groupId, t.groups.id))
      .leftJoin(t.user, and(eq(t.user.id, t.groupMembers.userId), isNull(t.user.deactivatedAt)))
      .groupBy(t.groups.id)
      .orderBy(asc(t.groups.name))
    const everyone = await activeUserCount(db)
    return c.json(rows.map((g): GroupDto => (g.id === MEMBERS_GROUP_ID ? { ...g, memberCount: everyone } : g)))
  })

  .get('/:id', requireUser, async (c) => c.json(await detail(c.var.db, await loadGroup(c.var.db, c.req.param('id')))))

  .post('/', requireAdmin, async (c) => {
    const input = await readJson(c.req, groupInputSchema)
    try {
      const [row] = await c.var.db.insert(t.groups).values(input).returning()
      return c.json(await detail(c.var.db, row), 201)
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('name_taken', 'A group with that name already exists')
      throw err
    }
  })

  .patch('/:id', requireAdmin, async (c) => {
    const { db } = c.var
    const group = editable(await loadGroup(db, c.req.param('id')))
    const input = await readJson(c.req, groupPatchSchema)
    try {
      const [row] = await db.update(t.groups).set(input).where(eq(t.groups.id, group.id)).returning()
      return c.json(await detail(db, row))
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('name_taken', 'A group with that name already exists')
      throw err
    }
  })

  .delete('/:id', requireAdmin, async (c) => {
    const { db } = c.var
    const group = editable(await loadGroup(db, c.req.param('id')))
    await db.transaction(async (tx) => {
      // Grants and restrictions name principals by id without a foreign key; drop the group's rows too.
      await tx.delete(t.spacePermissions).where(and(eq(t.spacePermissions.principalType, 'group'), eq(t.spacePermissions.principalId, group.id)))
      await tx.delete(t.pageRestrictions).where(and(eq(t.pageRestrictions.principalType, 'group'), eq(t.pageRestrictions.principalId, group.id)))
      await tx.delete(t.groups).where(eq(t.groups.id, group.id))
    })
    return c.body(null, 204)
  })

  .put('/:id/members', requireAdmin, async (c) => {
    const { db } = c.var
    const group = editable(await loadGroup(db, c.req.param('id')))
    const { userIds } = await readJson(c.req, groupMembersSchema)
    const unique = [...new Set(userIds)]
    await db.transaction(async (tx) => {
      if (unique.length) {
        const known = await tx.select({ id: t.user.id }).from(t.user).where(inArray(t.user.id, unique))
        if (known.length !== unique.length) throw badRequest('unknown_user', 'One or more people do not exist')
      }
      await tx.delete(t.groupMembers).where(eq(t.groupMembers.groupId, group.id))
      if (unique.length) await tx.insert(t.groupMembers).values(unique.map((userId) => ({ groupId: group.id, userId })))
    })
    return c.json(await detail(db, group))
  })
