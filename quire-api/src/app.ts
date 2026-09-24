import type { ApiErrorBody, SiteRole } from '@quire/shared'
import { Hono } from 'hono'
import { createAuth, type Auth } from './auth.ts'
import type { Db } from './db/client.ts'
import type { Env } from './env.ts'
import { ApiError } from './lib/errors.ts'
import type { Mailer } from './mail/mailer.ts'
import { originCheck } from './middleware/origin.ts'
import { loadSession } from './middleware/session.ts'
import { groups } from './routes/groups.ts'
import { health } from './routes/health.ts'
import { invites } from './routes/invites.ts'
import { pages } from './routes/pages.ts'
import { spaces } from './routes/spaces.ts'
import { me, users } from './routes/users.ts'

export interface AppDeps {
  db: Db
  env: Env
  mailer: Mailer
}

export interface SessionUser {
  id: string
  siteRole: SiteRole
}

export type AppEnv = { Variables: AppDeps & { auth: Auth; user: SessionUser | null } }

export function createApp(deps: AppDeps) {
  const auth = createAuth(deps)
  const app = new Hono<AppEnv>().basePath('/api')

  app.use(async (c, next) => {
    c.set('db', deps.db)
    c.set('env', deps.env)
    c.set('mailer', deps.mailer)
    c.set('auth', auth)
    await next()
  })

  app.route('/health', health)
  // Better Auth runs its own origin check and rate limits on these routes.
  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))

  app.use(originCheck)
  app.use(loadSession)
  app.route('/me', me)
  app.route('/users', users)
  app.route('/groups', groups)
  app.route('/invites', invites)
  app.route('/spaces', spaces)
  app.route('/pages', pages)

  app.notFound((c) => c.json<ApiErrorBody>({ code: 'not_found', message: 'Not found' }, 404))
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json<ApiErrorBody>({ ...err.details, code: err.code, message: err.message }, err.status)
    console.error(err)
    return c.json<ApiErrorBody>({ code: 'internal', message: 'Something went wrong' }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
