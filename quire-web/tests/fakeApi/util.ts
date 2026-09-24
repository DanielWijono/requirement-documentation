import type { ApiErrorBody } from '@quire/shared'
import { HttpResponse, type DefaultBodyType, type http, type StrictRequest } from 'msw'
import type { z } from 'zod'
import { fakeDb, SESSION_COOKIE, type FakeUser } from './db'

export type ResolverInfo = Parameters<Parameters<typeof http.get>[1]>[0]

export function fail(status: number, code: string, message: string) {
  return HttpResponse.json<ApiErrorBody>({ code, message }, { status })
}

export function sessionUser(cookies: Record<string, string>): FakeUser | null {
  const userId = fakeDb.sessions.get(cookies[SESSION_COOKIE] ?? '')
  const user = userId ? fakeDb.users.get(userId) : undefined
  return user && !user.deactivated ? user : null
}

/** Run the resolver for a signed-in person, or answer 401 like `requireUser`. */
export function withUser(fn: (info: ResolverInfo, user: FakeUser) => Response | Promise<Response>) {
  return (info: ResolverInfo) => {
    const user = sessionUser(info.cookies)
    return user ? fn(info, user) : fail(401, 'unauthenticated', 'Sign in to continue')
  }
}

/** Parse a JSON body like the API's `readJson`: 400 on bad JSON or a schema failure. */
export async function body<T extends z.ZodType>(request: StrictRequest<DefaultBodyType>, schema: T): Promise<z.infer<T> | Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail(400, 'invalid_json', 'The request body must be JSON')
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : fail(400, 'invalid_request', parsed.error.issues[0].message)
}
