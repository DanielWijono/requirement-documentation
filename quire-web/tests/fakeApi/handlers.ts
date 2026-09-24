import { inviteAcceptSchema, inviteCreateSchema, MIN_PASSWORD_LENGTH, type InviteLookupDto } from '@quire/shared'
import { http, HttpResponse } from 'msw'
import { fakeDb, SESSION_COOKIE } from './db'
import { spaceHandlers } from './spaces'
import { body, fail, sessionUser } from './util'

const setSession = (token: string) => ({ 'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; SameSite=Lax` })
const clearSession = { 'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0` }

export const handlers = [
  http.post('*/api/auth/sign-in/email', async ({ request }) => {
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    const user = email ? fakeDb.userByEmail(email) : undefined
    if (!user || user.password !== password || user.deactivated) return fail(401, 'INVALID_EMAIL_OR_PASSWORD', 'Invalid email or password')
    return HttpResponse.json({ token: 'fake', user: fakeDb.userDto(user.id) }, { headers: setSession(fakeDb.createSession(user.id)) })
  }),

  http.post('*/api/auth/sign-out', ({ cookies }) => {
    fakeDb.sessions.delete(cookies[SESSION_COOKIE] ?? '')
    return HttpResponse.json({ success: true }, { headers: clearSession })
  }),

  http.post('*/api/auth/request-password-reset', async ({ request }) => {
    const { email } = (await request.json()) as { email?: string }
    if (email) fakeDb.requestReset(email)
    return HttpResponse.json({ status: true })
  }),

  http.post('*/api/auth/reset-password', async ({ request }) => {
    const { newPassword, token } = (await request.json()) as { newPassword?: string; token?: string }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return fail(400, 'PASSWORD_TOO_SHORT', 'Password too short')
    if (!token || !fakeDb.resetPassword(token, newPassword)) return fail(400, 'INVALID_TOKEN', 'Invalid token')
    return HttpResponse.json({ status: true })
  }),

  http.get('*/api/me', ({ cookies }) => {
    const user = sessionUser(cookies)
    return user ? HttpResponse.json(fakeDb.userDto(user.id)) : fail(401, 'unauthenticated', 'Sign in to continue')
  }),

  http.post('*/api/invites', async ({ request, cookies }) => {
    const user = sessionUser(cookies)
    if (!user) return fail(401, 'unauthenticated', 'Sign in to continue')
    if (user.siteRole !== 'admin') return fail(403, 'forbidden', 'Only site admins can do that')
    const input = await body(request, inviteCreateSchema)
    if (input instanceof Response) return input
    if (fakeDb.userByEmail(input.email)) return fail(409, 'already_member', 'That person already has an account')
    fakeDb.createInvite(input.email, input.siteRole, user.id)
    return HttpResponse.json({ email: input.email, siteRole: input.siteRole, invitedBy: user.name }, { status: 201 })
  }),

  http.get('*/api/invites/:token', ({ params }) => {
    const invite = fakeDb.invites.get(params.token as string)
    if (!invite) return fail(404, 'not_found', 'Invite was not found')
    if (invite.acceptedAt || invite.expiresAt <= Date.now()) return fail(410, 'invite_expired', 'This invite has expired or was already used')
    const lookup: InviteLookupDto = { email: invite.email, inviterName: fakeDb.users.get(invite.inviterId)!.name, expiresAt: new Date(invite.expiresAt).toISOString() }
    return HttpResponse.json(lookup)
  }),

  http.post('*/api/invites/:token/accept', async ({ request, params }) => {
    const input = await body(request, inviteAcceptSchema)
    if (input instanceof Response) return input
    const invite = fakeDb.invites.get(params.token as string)
    if (!invite) return fail(404, 'not_found', 'Invite was not found')
    if (invite.acceptedAt || invite.expiresAt <= Date.now()) return fail(410, 'invite_expired', 'This invite has expired or was already used')
    invite.acceptedAt = Date.now()
    const id = fakeDb.createUser({ email: invite.email, name: input.name, password: input.password, siteRole: invite.siteRole })
    return HttpResponse.json({ ok: true }, { status: 201, headers: setSession(fakeDb.createSession(id)) })
  }),

  ...spaceHandlers,

  // Anything the fake doesn't implement yet fails loudly instead of hanging a test.
  http.all('*/api/*', ({ request }) => fail(501, 'not_in_fake', `The fake API has no handler for ${request.method} ${new URL(request.url).pathname}`)),
]
