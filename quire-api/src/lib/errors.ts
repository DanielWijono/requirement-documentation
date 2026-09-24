import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

/** An error the client is meant to see: rendered as `{ code, message }` with its status. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = (what = 'That') => new ApiError(404, 'not_found', `${what} was not found`)
export const forbidden = (message = 'You do not have permission to do that') => new ApiError(403, 'forbidden', message)
export const conflict = (code: string, message: string) => new ApiError(409, code, message)
export const badRequest = (code: string, message: string) => new ApiError(400, code, message)

/** Validate a request body against a schema, turning failures into a 400 with the first problem. */
export async function readJson<T extends z.ZodType>(req: { json: () => Promise<unknown> }, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('invalid_json', 'The request body must be JSON')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue.path.join('.')
    throw badRequest('invalid_request', path ? `${path}: ${issue.message}` : issue.message)
  }
  return parsed.data
}

/** A Postgres unique constraint failed (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(err: unknown) {
  return (err as { cause?: { code?: string } }).cause?.code === '23505'
}
