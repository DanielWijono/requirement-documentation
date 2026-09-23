import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.ts'

describe('loadEnv', () => {
  it('falls back to the compose defaults in development', () => {
    const env = loadEnv({})
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, WEB_ORIGIN: 'http://localhost:5173' })
    expect(env.DATABASE_URL).toContain(':5434/quire')
  })

  it('requires explicit settings in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow()
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db/quire', WEB_ORIGIN: 'https://quire.example' }).PORT).toBe(3000)
  })
})
