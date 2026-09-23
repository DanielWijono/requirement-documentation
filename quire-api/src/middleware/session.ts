import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../app.ts'
import { ApiError, forbidden } from '../lib/errors.ts'

/** Attach the signed-in person (or null) to every request. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
  const user = result?.user
  c.set('user', user && !user.deactivatedAt ? { id: user.id, siteRole: user.siteRole === 'admin' ? 'admin' : 'member' } : null)
  await next()
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new ApiError(401, 'unauthenticated', 'Sign in to continue')
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new ApiError(401, 'unauthenticated', 'Sign in to continue')
  if (c.var.user.siteRole !== 'admin') throw forbidden('Only site admins can do that')
  await next()
}

/** The signed-in person inside a route guarded by `requireUser`. */
export function sessionUser(c: { var: AppEnv['Variables'] }) {
  if (!c.var.user) throw new ApiError(401, 'unauthenticated', 'Sign in to continue')
  return c.var.user
}
