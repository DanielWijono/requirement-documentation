import { userUpdateSchema } from '@quire/shared'
import { asc, eq, ilike, isNull, or, and } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app.ts'
import * as t from '../db/schema.ts'
import { badRequest, notFound, readJson } from '../lib/errors.ts'
import { requireAdmin, requireUser, sessionUser } from '../middleware/session.ts'
import { toUserDto, userColumns } from '../services/users.ts'

export const me = new Hono<AppEnv>().get('/', requireUser, async (c) => {
  const [row] = await c.var.db.select(userColumns).from(t.user).where(eq(t.user.id, sessionUser(c).id))
  return c.json(toUserDto(row))
})

export const users = new Hono<AppEnv>()
  // Everyone signed in can look people up (mentions, share dialog, permissions matrix).
  .get('/', requireUser, async (c) => {
    const q = c.req.query('q')?.trim()
    const includeDeactivated = c.req.query('includeDeactivated') === '1' && sessionUser(c).siteRole === 'admin'
    const pattern = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : undefined
    const rows = await c.var.db
      .select(userColumns)
      .from(t.user)
      .where(and(includeDeactivated ? undefined : isNull(t.user.deactivatedAt), pattern ? or(ilike(t.user.name, pattern), ilike(t.user.email, pattern)) : undefined))
      .orderBy(asc(t.user.name))
      .limit(q ? 20 : 500)
    return c.json(rows.map(toUserDto))
  })

  .patch('/:id', requireAdmin, async (c) => {
    const id = c.req.param('id')
    const input = await readJson(c.req, userUpdateSchema)
    // Guard against locking the workspace out of its own admin.
    if (id === sessionUser(c).id) throw badRequest('self_update', 'You cannot change your own role or deactivate yourself')
    const { db } = c.var
    const row = await db.transaction(async (tx) => {
      const patch: Partial<typeof t.user.$inferInsert> = { updatedAt: new Date() }
      if (input.siteRole) patch.siteRole = input.siteRole
      if (input.deactivated !== undefined) patch.deactivatedAt = input.deactivated ? new Date() : null
      const [updated] = await tx.update(t.user).set(patch).where(eq(t.user.id, id)).returning()
      if (!updated) throw notFound('User')
      if (input.deactivated) await tx.delete(t.session).where(eq(t.session.userId, id))
      return updated
    })
    return c.json(toUserDto(row))
  })
