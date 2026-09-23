import { createApp, type App } from '../../src/app.ts'
import { loadEnv } from '../../src/env.ts'
import type { Mail, Mailer } from '../../src/mail/mailer.ts'
import { smtpMailer } from '../../src/mail/mailer.ts'
import { createUserWithPassword } from '../../src/services/users.ts'
import { testDb } from './db.ts'

export const WEB_ORIGIN = 'http://localhost:5173'
export const PASSWORD = 'correct horse battery'

export const testEnv = loadEnv({ NODE_ENV: 'test', WEB_ORIGIN, SMTP_PORT: process.env.TEST_SMTP_PORT ?? '1025' })

/** Keeps sent mail in memory for assertions that don't need a real inbox. */
export function captureMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return { sent, send: async (mail) => void sent.push(mail) }
}

export function testApp(mailer: Mailer = captureMailer()) {
  return createApp({ db: testDb().db, env: testEnv, mailer })
}

export function mailpitApp() {
  return testApp(smtpMailer(testEnv))
}

let ip = 0

/** A browser-like client: keeps cookies between requests and sends the web origin. */
export function client(app: App) {
  const jar = new Map<string, string>()
  // Each client gets its own address so auth rate limits don't leak between tests.
  const address = `10.0.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`

  async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
      method,
      headers: {
        origin: WEB_ORIGIN,
        'x-forwarded-for': address,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(';')
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim())) || value === ''
      if (expired) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }

  return {
    jar,
    get: (path: string, headers?: Record<string, string>) => request('GET', path, undefined, headers),
    post: (path: string, body?: unknown, headers?: Record<string, string>) => request('POST', path, body ?? {}, headers),
    put: (path: string, body?: unknown, headers?: Record<string, string>) => request('PUT', path, body ?? {}, headers),
    patch: (path: string, body?: unknown, headers?: Record<string, string>) => request('PATCH', path, body ?? {}, headers),
    delete: (path: string, headers?: Record<string, string>) => request('DELETE', path, undefined, headers),
  }
}

export type Client = ReturnType<typeof client>

let n = 0

/** Create a person with a password and return a client signed in as them. */
export async function signedIn(app: App, over: { siteRole?: 'admin' | 'member'; name?: string; email?: string; id?: string } = {}) {
  const i = ++n
  const user = await createUserWithPassword(testDb().db, {
    id: over.id,
    email: over.email ?? `person${i}-${crypto.randomUUID().slice(0, 8)}@test.local`,
    name: over.name ?? `Person ${i}`,
    password: PASSWORD,
    siteRole: over.siteRole ?? 'member',
  })
  const c = client(app)
  const res = await c.post('/api/auth/sign-in/email', { email: user.email, password: PASSWORD })
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
  return Object.assign(c, { user })
}
