import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb } from './db/client.ts'
import { loadEnv } from './env.ts'
import { smtpMailer } from './mail/mailer.ts'

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL)
const app = createApp({ db, env, mailer: smtpMailer(env) })

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`quire-api listening on http://localhost:${info.port}`)
})

function shutdown() {
  server.close()
  void sql.end({ timeout: 5 }).then(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
