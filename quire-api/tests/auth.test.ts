import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { bootstrapAdmin } from '../src/services/users.ts'
import { client, mailpitApp, PASSWORD, signedIn, testApp } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'
import { latestMailTo, linkIn } from './helpers/mailpit.ts'

describe('sign in and sessions', () => {
  it('signs in with email and password and sets a locked-down cookie', async () => {
    const app = testApp()
    const alice = await signedIn(app, { name: 'Alice Doe' })
    const res = await client(app).post('/api/auth/sign-in/email', { email: alice.user.email, password: PASSWORD })
    const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)

    const me = await alice.get('/api/me')
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ id: alice.user.id, name: 'Alice Doe', initials: 'AD', siteRole: 'member', deactivated: false })
  })

  it('rejects a wrong password', async () => {
    const app = testApp()
    const bob = await signedIn(app)
    const res = await client(app).post('/api/auth/sign-in/email', { email: bob.user.email, password: 'not the password' })
    expect(res.status).toBe(401)
  })

  it('answers /me with 401 when signed out', async () => {
    const res = await client(testApp()).get('/api/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ code: 'unauthenticated', message: 'Sign in to continue' })
  })

  it('signs out', async () => {
    const app = testApp()
    const carol = await signedIn(app)
    expect((await carol.post('/api/auth/sign-out')).status).toBe(200)
    expect((await carol.get('/api/me')).status).toBe(401)
  })

  it('has no open sign-up: accounts come from invites', async () => {
    const res = await client(testApp()).post('/api/auth/sign-up/email', { email: 'walk-in@test.local', password: PASSWORD, name: 'Walk In' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    const rows = await testDb().db.select().from(t.user).where(eq(t.user.email, 'walk-in@test.local'))
    expect(rows).toHaveLength(0)
  })

  it('rate-limits repeated sign-in attempts', async () => {
    const app = testApp()
    const dave = await signedIn(app)
    const attacker = client(app)
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await attacker.post('/api/auth/sign-in/email', { email: dave.user.email, password: `guess-${i}-guess` })).status)
    expect(statuses).toContain(429)
  })
})

describe('deactivation', () => {
  it('ends the person’s sessions and blocks new sign-ins', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    const erin = await signedIn(app)
    const res = await admin.patch(`/api/users/${erin.user.id}`, { deactivated: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ deactivated: true })
    expect((await erin.get('/api/me')).status).toBe(401)
    const again = await client(app).post('/api/auth/sign-in/email', { email: erin.user.email, password: PASSWORD })
    expect(again.status).not.toBe(200)
  })

  it('can be reversed', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    const fay = await signedIn(app)
    await admin.patch(`/api/users/${fay.user.id}`, { deactivated: true })
    await admin.patch(`/api/users/${fay.user.id}`, { deactivated: false })
    const res = await client(app).post('/api/auth/sign-in/email', { email: fay.user.email, password: PASSWORD })
    expect(res.status).toBe(200)
  })
})

describe('invites', () => {
  it('invite → email → accept → signed in', async () => {
    const app = mailpitApp()
    const admin = await signedIn(app, { siteRole: 'admin', name: 'Ada Admin' })
    const email = `invitee-${crypto.randomUUID().slice(0, 8)}@test.local`

    const created = await admin.post('/api/invites', { email: email.toUpperCase() })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ email, siteRole: 'member', invitedBy: 'Ada Admin' })

    const mail = await latestMailTo(email)
    expect(mail.Subject).toBe('Ada Admin invited you to Quire')
    const link = linkIn(mail.Text, /http:\/\/localhost:5173\/invite\/[\w-]+/)
    const token = link.split('/').pop()!

    const guest = client(app)
    const lookup = await guest.get(`/api/invites/${token}`)
    expect(await lookup.json()).toMatchObject({ email, inviterName: 'Ada Admin' })

    const accepted = await guest.post(`/api/invites/${token}/accept`, { name: 'New Person', password: 'a brand new password' })
    expect(accepted.status).toBe(201)
    const me = await guest.get('/api/me')
    expect(await me.json()).toMatchObject({ email, name: 'New Person', siteRole: 'member' })

    // The link is single-use.
    expect((await client(app).get(`/api/invites/${token}`)).status).toBe(410)
    expect((await client(app).post(`/api/invites/${token}/accept`, { name: 'Again', password: 'a brand new password' })).status).toBe(410)
    // And the new account signs in with its own password.
    expect((await client(app).post('/api/auth/sign-in/email', { email, password: 'a brand new password' })).status).toBe(200)
  })

  it('only admins invite', async () => {
    const app = testApp()
    const member = await signedIn(app)
    expect((await member.post('/api/invites', { email: 'x@test.local' })).status).toBe(403)
    expect((await client(app).post('/api/invites', { email: 'x@test.local' })).status).toBe(401)
  })

  it('refuses to invite someone who already has an account', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    const res = await admin.post('/api/invites', { email: admin.user.email })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('already_member')
  })

  it('validates the request body', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    const bad = await admin.post('/api/invites', { email: 'not-an-email' })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { code: string }).code).toBe('invalid_request')
    const notJson = await admin.post('/api/invites', undefined, { 'content-type': 'application/json' })
    expect(notJson.status).toBe(400)
  })

  it('rejects unknown and expired tokens', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    expect((await client(app).get('/api/invites/nope')).status).toBe(404)
    expect((await client(app).post('/api/invites/nope/accept', { name: 'X', password: PASSWORD })).status).toBe(404)

    const mailer = { sent: [] as { text: string }[], send: async (m: { text: string }) => void mailer.sent.push(m) }
    const app2 = testApp(mailer)
    const admin2 = client(app2)
    admin2.jar.clear()
    for (const [k, v] of admin.jar) admin2.jar.set(k, v)
    await admin2.post('/api/invites', { email: 'late@test.local' })
    const token = /invite\/([\w-]+)/.exec(mailer.sent[0].text)![1]
    await testDb().db.update(t.invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(t.invites.email, 'late@test.local'))
    expect((await client(app2).get(`/api/invites/${token}`)).status).toBe(410)
  })

  it('lists and revokes pending invites', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    await admin.post('/api/invites', { email: 'pending@test.local', siteRole: 'admin' })
    const list = (await (await admin.get('/api/invites')).json()) as { id: string; email: string; siteRole: string }[]
    expect(list).toEqual([expect.objectContaining({ email: 'pending@test.local', siteRole: 'admin' })])
    expect((await admin.delete(`/api/invites/${list[0].id}`)).status).toBe(204)
    expect(await (await admin.get('/api/invites')).json()).toEqual([])
    expect((await admin.delete(`/api/invites/${list[0].id}`)).status).toBe(404)
  })
})

describe('password reset', () => {
  it('emails a link that sets a new password and ends old sessions', async () => {
    const app = mailpitApp()
    const email = `forgetful-${crypto.randomUUID().slice(0, 8)}@test.local`
    const gus = await signedIn(app, { email, name: 'Gus' })

    const asked = await client(app).post('/api/auth/request-password-reset', { email, redirectTo: 'http://localhost:5173/reset-password' })
    expect(asked.status).toBe(200)
    const mail = await latestMailTo(email)
    expect(mail.Subject).toBe('Reset your Quire password')
    const token = new URL(linkIn(mail.Text, /http:\/\/localhost:5173\/reset-password\?token=[\w%-]+/)).searchParams.get('token')!

    const reset = await client(app).post('/api/auth/reset-password', { token, newPassword: 'my new long password' })
    expect(reset.status).toBe(200)
    expect((await gus.get('/api/me')).status).toBe(401)
    expect((await client(app).post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(401)
    expect((await client(app).post('/api/auth/sign-in/email', { email, password: 'my new long password' })).status).toBe(200)
  })
})

describe('bootstrapAdmin', () => {
  it('creates the first admin once', async () => {
    const admin = await bootstrapAdmin(testDb().db, { email: 'Root@Test.local', name: 'Root', password: PASSWORD })
    expect(admin).toMatchObject({ email: 'root@test.local', siteRole: 'admin' })
    await expect(bootstrapAdmin(testDb().db, { email: 'second@test.local', name: 'Second', password: PASSWORD })).rejects.toThrow(/already exists/)
    const res = await client(testApp()).post('/api/auth/sign-in/email', { email: 'root@test.local', password: PASSWORD })
    expect(res.status).toBe(200)
  })
})

describe('origin check', () => {
  it('blocks cross-site writes and lets same-site and non-browser clients through', async () => {
    const app = testApp()
    const admin = await signedIn(app, { siteRole: 'admin' })
    expect((await admin.post('/api/groups', { name: 'Evil' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await admin.post('/api/groups', { name: 'Script' }, { origin: '', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await admin.post('/api/groups', { name: 'Curl' }, { origin: '' })).status).toBe(201)
    expect((await admin.post('/api/groups', { name: 'Web' })).status).toBe(201)
  })
})
