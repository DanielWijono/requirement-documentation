import type { ApiErrorBody } from '@quire/shared'

/**
 * A failed API call. `status` 0 means the request never reached the server (offline, DNS, CORS);
 * `current` carries the server's state on a 409 so the UI can show what changed.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly current: unknown

  constructor(status: number, code: string, message: string, current?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.current = current
  }

  get offline() {
    return this.status === 0
  }
}

export interface RequestOptions {
  /** Sent as If-Match: the version the client started from. */
  ifMatch?: number
  signal?: AbortSignal
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (options.ifMatch !== undefined) headers['if-match'] = `"${options.ifMatch}"`

  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'offline', 'Can’t reach Quire. Check your connection.')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data: unknown = text ? safeJson(text) : undefined
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody> & { current?: unknown }
    throw new ApiError(res.status, err.code ?? `http_${res.status}`, err.message ?? res.statusText ?? 'Request failed', err.current)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body: unknown = {}, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body: unknown = {}, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
}
