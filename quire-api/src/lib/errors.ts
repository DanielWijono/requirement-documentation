import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

/** An error the client is meant to see: rendered as `{ code, message }` with its status. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  /** Extra fields for the body, e.g. the server's current state on a 409. */
  readonly details?: Record<string, unknown>

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const notFound = (what = 'That') => new ApiError(404, 'not_found', `${what} was not found`)
export const forbidden = (message = 'You do not have permission to do that') => new ApiError(403, 'forbidden', message)
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new ApiError(409, code, message, details)
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

/**
 * The version number in an If-Match header (`"3"`, `W/"3"` or `3`); null when absent.
 * Throws 400 for anything else.
 */
export function ifMatchVersion(header: string | undefined): number | null {
  if (header === undefined || header.trim() === '') return null
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim())
  if (!m) throw badRequest('invalid_if_match', 'If-Match must be a version number')
  return Number(m[1])
}

export function requireIfMatch(header: string | undefined): number {
  const v = ifMatchVersion(header)
  if (v === null) throw new ApiError(428, 'precondition_required', 'Send the version you started from in If-Match')
  return v
}
