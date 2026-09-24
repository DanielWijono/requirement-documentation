import { sessionContract, spacesContract, type ContractClient, type ContractTarget } from '@quire/shared/contract'
import { SEED_PASSWORD } from '@quire/shared/seed'
import { fakeDb, SEED_ADMIN_ID } from '../fakeApi/db'

// The same suite runs against the real API (quire-api/tests/contract.test.ts).
// MSW remembers cookies per origin, so each client gets its own origin (and none shares the
// jsdom document's): clients stay as independent as separate browsers.
let clients = 0

function fakeClient(): ContractClient {
  const ORIGIN = `http://client-${++clients}.contract.test`
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
  return {
    get: (path) => request('GET', path),
    post: (path, body = {}) => request('POST', path, body),
    put: (path, body = {}) => request('PUT', path, body),
    patch: (path, body = {}) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  }
}

const target = (): ContractTarget => ({
  newClient: fakeClient,
  admin: { email: fakeDb.users.get(SEED_ADMIN_ID)!.email, password: SEED_PASSWORD },
  lastMailTo: async (to) => fakeDb.mail.findLast((m) => m.to === to)?.text ?? '',
})

sessionContract(target)
spacesContract(target)
