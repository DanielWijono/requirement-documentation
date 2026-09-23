import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import * as t from './db/schema.ts'
import type { Env } from './env.ts'
import type { Mailer } from './mail/mailer.ts'
import { resetPasswordEmail } from './mail/templates.ts'

export const MIN_PASSWORD_LENGTH = 10

export function createAuth({ db, env, mailer }: { db: Db; env: Env; mailer: Mailer }) {
  return betterAuth({
    appName: 'Quire',
    // Tests deliberately trigger failures (e.g. a deactivated sign-in); keep their output clean.
    logger: { disabled: env.NODE_ENV === 'test' },
    baseURL: env.WEB_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: t.user, session: t.session, account: t.account, verification: t.verification },
    }),
    emailAndPassword: {
      enabled: true,
      // Invite-only: accounts are created by accepting an invite (see routes/invites.ts).
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, token }) => {
        const url = `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`
        await mailer.send(resetPasswordEmail(user.email, user.name, url))
      },
    },
    user: {
      additionalFields: {
        colorSeed: { type: 'number', input: false, defaultValue: 0 },
        siteRole: { type: 'string', input: false, defaultValue: 'member' },
        deactivatedAt: { type: 'date', input: false, required: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 5 },
        '/reset-password': { window: 60, max: 10 },
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    databaseHooks: {
      session: {
        create: {
          // Deactivated people keep their data but cannot sign in.
          before: async (session) => {
            const [row] = await db.select({ deactivatedAt: t.user.deactivatedAt }).from(t.user).where(eq(t.user.id, session.userId))
            if (row?.deactivatedAt) return false
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
