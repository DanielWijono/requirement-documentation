import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../app.ts'
import { forbidden } from '../lib/errors.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF guard for state-changing requests. Browsers always send Origin on cross-site requests,
 * so a mismatch is rejected; a request with neither Origin nor Sec-Fetch-Site comes from a non-browser client.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('origin')
    const fetchSite = c.req.header('sec-fetch-site')
    const allowed = origin ? origin === c.var.env.WEB_ORIGIN : !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none'
    if (!allowed) throw forbidden('Cross-site request blocked')
  }
  await next()
}
