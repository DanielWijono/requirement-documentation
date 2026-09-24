import { sessionContract, type ContractClient, type ContractTarget } from '@quire/shared/contract'
import { SEED_PASSWORD } from '@quire/shared/seed'
import { fakeDb, SEED_ADMIN_ID } from '../fakeApi/db'

// The same suite runs against the real API (quire-api/tests/contract.test.ts).
// A separate origin keeps these clients away from the jsdom document's cookies.
const ORIGIN = 'http://contract.test'

function fakeClient(): ContractClient {
  const jar = new Map<string, string>()
  async function request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(';')
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]
      if (value === '' || attrs.some((a) => /max-age=0/i.test(a.trim()))) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }
  return { get: (path) => request('GET', path), post: (path, body = {}) => request('POST', path, body) }
}

const target = (): ContractTarget => ({
  newClient: fakeClient,
  admin: { email: fakeDb.users.get(SEED_ADMIN_ID)!.email, password: SEED_PASSWORD },
  lastMailTo: async (to) => fakeDb.mail.findLast((m) => m.to === to)?.text ?? '',
})

sessionContract(target)
