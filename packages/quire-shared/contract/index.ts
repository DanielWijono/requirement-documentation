import { describe, expect, it } from 'vitest'
import type { InviteLookupDto, UserDto } from '../src/api.ts'

/**
 * The contract suite: behaviour both the real API and the web tests' fake backend must share.
 * Each package runs it against its own target, so the fake can't drift from the API.
 * Every route family added to the fake gets cases here.
 */

export interface ContractResponse {
  status: number
  json(): Promise<unknown>
}

/** One independent browser: its own cookies. */
export interface ContractClient {
  get(path: string): Promise<ContractResponse>
  post(path: string, body?: unknown): Promise<ContractResponse>
}

export interface ContractTarget {
  newClient(): ContractClient
  /** A site admin who can already sign in. */
  admin: { email: string; password: string }
  /** The text of the latest email sent to `to`. */
  lastMailTo(to: string): Promise<string>
}

async function signedIn(target: ContractTarget, email: string, password: string) {
  const c = target.newClient()
  const res = await c.post('/api/auth/sign-in/email', { email, password })
  expect(res.status).toBe(200)
  return c
}

export function sessionContract(target: () => ContractTarget) {
  describe('contract: sessions', () => {
    it('answers 401 without a session', async () => {
      const res = await target().newClient().get('/api/me')
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 'unauthenticated' })
    })

    it('rejects a wrong password and signs in with the right one', async () => {
      const t = target()
      expect((await t.newClient().post('/api/auth/sign-in/email', { email: t.admin.email, password: 'wrong-password' })).status).toBe(401)
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      const me = (await (await admin.get('/api/me')).json()) as UserDto
      expect(me).toMatchObject({ email: t.admin.email, siteRole: 'admin', deactivated: false })
      expect(me.initials).toMatch(/^[A-Z?]{1,2}$/)
    })

    it('signs out', async () => {
      const t = target()
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      expect((await admin.post('/api/auth/sign-out')).status).toBe(200)
      expect((await admin.get('/api/me')).status).toBe(401)
    })

    it('answers a reset request the same way whether or not the account exists', async () => {
      const res = await target().newClient().post('/api/auth/request-password-reset', { email: 'nobody@example.com' })
      expect(res.status).toBe(200)
    })

    it('resets a password from the emailed link and ends other sessions', async () => {
      const t = target()
      const before = await signedIn(t, t.admin.email, t.admin.password)
      expect((await t.newClient().post('/api/auth/request-password-reset', { email: t.admin.email })).status).toBe(200)
      const token = /reset-password\?token=([^\s&]+)/.exec(await t.lastMailTo(t.admin.email))?.[1]
      expect(token).toBeTruthy()
      const guest = t.newClient()
      expect((await guest.post('/api/auth/reset-password', { newPassword: 'a brand new password', token: 'wrong' })).status).toBe(400)
      expect((await guest.post('/api/auth/reset-password', { newPassword: 'a brand new password', token: decodeURIComponent(token!) })).status).toBe(200)
      expect((await before.get('/api/me')).status).toBe(401)
      expect((await t.newClient().post('/api/auth/sign-in/email', { email: t.admin.email, password: t.admin.password })).status).toBe(401)
      await signedIn(t, t.admin.email, 'a brand new password')
    })
  })

  describe('contract: invites', () => {
    it('invite → look up → accept → signed in, once', async () => {
      const t = target()
      const admin = await signedIn(t, t.admin.email, t.admin.password)
      const email = `new-${Math.random().toString(36).slice(2, 8)}@example.com`
      expect((await admin.post('/api/invites', { email })).status).toBe(201)
      const token = /\/invite\/([\w-]+)/.exec(await t.lastMailTo(email))?.[1]
      expect(token).toBeTruthy()

      const guest = t.newClient()
      const lookup = (await (await guest.get(`/api/invites/${token}`)).json()) as InviteLookupDto
      expect(lookup).toMatchObject({ email })
      expect((await guest.post(`/api/invites/${token}/accept`, { name: 'Nia New', password: 'short' })).status).toBe(400)
      expect((await guest.post(`/api/invites/${token}/accept`, { name: 'Nia New', password: 'long enough password' })).status).toBe(201)
      expect(await (await guest.get('/api/me')).json()).toMatchObject({ email, name: 'Nia New', initials: 'NN', siteRole: 'member' })

      expect((await t.newClient().get(`/api/invites/${token}`)).status).toBe(410)
      expect((await t.newClient().post(`/api/invites/${token}/accept`, { name: 'Again', password: 'long enough password' })).status).toBe(410)
      expect((await t.newClient().get('/api/invites/not-a-real-token')).status).toBe(404)
      // Members can't invite.
      expect((await guest.post('/api/invites', { email: 'x@example.com' })).status).toBe(403)
    })
  })
}
