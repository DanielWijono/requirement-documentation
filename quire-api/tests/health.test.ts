import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { captureMailer, testApp, testEnv } from './helpers/app.ts'

describe('GET /api/health', () => {
  it('reports the database as up', async () => {
    const res = await testApp().request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'up' })
  })

  it('returns 503 when the database is unreachable', async () => {
    const { db, sql } = createDb('postgres://quire:quire@localhost:1/none')
    try {
      const res = await createApp({ db, env: testEnv, mailer: captureMailer() }).request('/api/health')
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ ok: false, db: 'down' })
    } finally {
      await sql.end()
    }
  })
})

describe('error handling', () => {
  it('answers unknown routes with a JSON 404', async () => {
    const res = await testApp().request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: 'not_found', message: 'Not found' })
  })

  it('hides internal errors behind a JSON 500', async () => {
    const app = testApp()
    app.get('/boom', () => {
      throw new Error('secret detail')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/api/boom')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: 'internal', message: 'Something went wrong' })
    spy.mockRestore()
  })
})
