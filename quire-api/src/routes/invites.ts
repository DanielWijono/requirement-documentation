import { inviteAcceptSchema, inviteCreateSchema, type InviteDto, type InviteLookupDto } from '@quire/shared'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app.ts'
import * as t from '../db/schema.ts'
import { ApiError, conflict, notFound, readJson } from '../lib/errors.ts'
import { inviteEmail } from '../mail/templates.ts'
import { requireAdmin, sessionUser } from '../middleware/session.ts'
import { createUserWithPassword } from '../services/users.ts'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function sha256(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Buffer.from(digest).toString('hex')
}

function newToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

const gone = () => new ApiError(410, 'invite_expired', 'This invite has expired or was already used')

export const invites = new Hono<AppEnv>()
  .post('/', requireAdmin, async (c) => {
    const me = sessionUser(c)
    const input = await readJson(c.req, inviteCreateSchema)
    const { db, env, mailer } = c.var
    const [existing] = await db.select({ id: t.user.id }).from(t.user).where(eq(t.user.email, input.email))
    if (existing) throw conflict('already_member', 'That person already has an account')

    const token = newToken()
    const [invite] = await db
      .insert(t.invites)
      .values({ email: input.email, siteRole: input.siteRole, tokenHash: await sha256(token), invitedById: me.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .returning()
    const [inviter] = await db.select({ name: t.user.name }).from(t.user).where(eq(t.user.id, me.id))
    await mailer.send(inviteEmail(input.email, inviter.name, `${env.WEB_ORIGIN}/invite/${token}`))
    const body: InviteDto = { id: invite.id, email: invite.email, siteRole: invite.siteRole, invitedBy: inviter.name, expiresAt: invite.expiresAt.toISOString() }
    return c.json(body, 201)
  })

  .get('/', requireAdmin, async (c) => {
    const rows = await c.var.db
      .select({ id: t.invites.id, email: t.invites.email, siteRole: t.invites.siteRole, invitedBy: t.user.name, expiresAt: t.invites.expiresAt })
      .from(t.invites)
      .innerJoin(t.user, eq(t.user.id, t.invites.invitedById))
      .where(and(isNull(t.invites.acceptedAt), gt(t.invites.expiresAt, new Date())))
      .orderBy(desc(t.invites.createdAt))
    return c.json(rows.map((r): InviteDto => ({ ...r, expiresAt: r.expiresAt.toISOString() })))
  })

  .delete('/:id', requireAdmin, async (c) => {
    const deleted = await c.var.db.delete(t.invites).where(eq(t.invites.id, c.req.param('id'))).returning({ id: t.invites.id })
    if (deleted.length === 0) throw notFound('Invite')
    return c.body(null, 204)
  })

  // Public: the accept screen looks the invite up by the token from the email link.
  .get('/:token', async (c) => {
    const [row] = await c.var.db
      .select({ email: t.invites.email, expiresAt: t.invites.expiresAt, acceptedAt: t.invites.acceptedAt, inviterName: t.user.name })
      .from(t.invites)
      .innerJoin(t.user, eq(t.user.id, t.invites.invitedById))
      .where(eq(t.invites.tokenHash, await sha256(c.req.param('token'))))
    if (!row) throw notFound('Invite')
    if (row.acceptedAt || row.expiresAt <= new Date()) throw gone()
    const body: InviteLookupDto = { email: row.email, inviterName: row.inviterName, expiresAt: row.expiresAt.toISOString() }
    return c.json(body)
  })

  // Public: create the account, then sign in so the response carries the session cookie.
  .post('/:token/accept', async (c) => {
    const input = await readJson(c.req, inviteAcceptSchema)
    const { db, auth } = c.var
    const tokenHash = await sha256(c.req.param('token'))
    const email = await db.transaction(async (tx) => {
      const [invite] = await tx
        .update(t.invites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(t.invites.tokenHash, tokenHash), isNull(t.invites.acceptedAt), gt(t.invites.expiresAt, new Date())))
        .returning()
      if (!invite) {
        const [known] = await tx.select({ id: t.invites.id }).from(t.invites).where(eq(t.invites.tokenHash, tokenHash))
        throw known ? gone() : notFound('Invite')
      }
      await createUserWithPassword(tx, { email: invite.email, name: input.name, password: input.password, siteRole: invite.siteRole })
      return invite.email
    })
    const signIn = await auth.api.signInEmail({ body: { email, password: input.password }, headers: c.req.raw.headers, asResponse: true })
    const res = c.json({ ok: true }, 201)
    for (const cookie of signIn.headers.getSetCookie()) res.headers.append('set-cookie', cookie)
    return res
  })
