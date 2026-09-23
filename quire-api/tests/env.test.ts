import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.ts'

describe('loadEnv', () => {
  it('falls back to the compose defaults in development', () => {
    const env = loadEnv({})
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, WEB_ORIGIN: 'http://localhost:5173', SMTP_PORT: 1025, SMTP_SECURE: false })
    expect(env.DATABASE_URL).toContain(':5434/quire')
  })

  it('requires explicit settings in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow()
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/quire',
      WEB_ORIGIN: 'https://quire.example',
      BETTER_AUTH_SECRET: 'x'.repeat(40),
      SMTP_HOST: 'smtp.example',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      MAIL_FROM: 'Quire <quire@example.com>',
    })
    expect(env).toMatchObject({ PORT: 3000, SMTP_SECURE: true })
  })
})
