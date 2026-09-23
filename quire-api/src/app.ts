import { Hono } from 'hono'
import type { ApiErrorBody } from '@quire/shared'
import type { Db } from './db/client.ts'
import { health } from './routes/health.ts'

export interface AppDeps {
  db: Db
}

export type AppEnv = { Variables: AppDeps }

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use(async (c, next) => {
    c.set('db', deps.db)
    await next()
  })

  app.route('/health', health)

  app.notFound((c) => c.json<ApiErrorBody>({ code: 'not_found', message: 'Not found' }, 404))
  app.onError((err, c) => {
    console.error(err)
    return c.json<ApiErrorBody>({ code: 'internal', message: 'Something went wrong' }, 500)
  })

  return app
}
