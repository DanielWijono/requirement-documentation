import { z } from 'zod'

/** Dev defaults match compose.yaml so `npm run dev` works with no .env file. Production must set everything. */
const DEV_DEFAULTS = {
  DATABASE_URL: 'postgres://quire:quire@localhost:5434/quire',
  WEB_ORIGIN: 'http://localhost:5173',
  BETTER_AUTH_SECRET: 'dev-only-secret-change-me-in-production-0123456789',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Quire <no-reply@quire.local>',
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  /** The origin people open in the browser. The API is served under it at /api (Vite proxy in dev, Caddy in production). */
  WEB_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(3),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const defaults = source.NODE_ENV === 'production' ? {} : DEV_DEFAULTS
  return envSchema.parse({ ...defaults, ...source })
}
