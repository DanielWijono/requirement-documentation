import {
  commentBodySchema,
  commentCreateSchema,
  parseSnippet,
  SEARCH_FILTERS,
  SEARCH_MODIFIED,
  SNIPPET_START,
  SNIPPET_STOP,
  searchQuerySchema,
  type CommentDto,
  type LabelCountDto,
  type PageItemDto,
  type QuickSearchDto,
  type SearchFilter,
  type SearchResponseDto,
  type StarredDto,
} from '@quire/shared'
import { http, HttpResponse } from 'msw'
import { fakeDb, type FakeComment, type FakePage } from './db'
import { canSeePage, pageAccess } from './pages'
import { spaceDto, visibleSpace } from './spaces'
import { body, fail, withUser } from './util'

/** Comments, home lists, labels and search in the fake API (quire-api routes/comments.ts, home.ts, search.ts). */

const now = () => new Date().toISOString()
const LIVE = new Set(['draft', 'published'])

function commentDto(c: FakeComment, replies: CommentDto[] = []): CommentDto {
  const deleted = c.deletedAt !== null
  return {
    id: c.id,
    pageId: c.pageId,
    parentId: c.parentId,
    authorId: c.authorId,
    body: deleted ? '' : c.body,
    anchorText: deleted ? null : c.anchorText,
    resolved: c.resolvedAt !== null,
    edited: c.updatedAt !== c.createdAt,
    deleted,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    replies,
  }
}

function threads(pageId: string): CommentDto[] {
  const rows = [...fakeDb.comments.values()].filter((c) => c.pageId === pageId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const replies = new Map<string, CommentDto[]>()
  for (const r of rows) if (r.parentId && r.deletedAt === null) replies.set(r.parentId, [...(replies.get(r.parentId) ?? []), commentDto(r)])
  return rows.filter((r) => r.parentId === null && (r.deletedAt === null || replies.has(r.id))).map((r) => commentDto(r, replies.get(r.id)))
}

/** The page a request is about, like `pageForSubject`. */
function pageFor(id: string, userId: string): FakePage | Response {
  const page = fakeDb.pages.get(id)
  if (!page || !visibleSpace(page.spaceId, userId)) return fail(404, 'not_found', 'Page was not found')
  return canSeePage(page, userId) ? page : fail(403, 'forbidden', 'This page is restricted')
}

function liveComment(id: string, userId: string) {
  const c = fakeDb.comments.get(id)
  if (!c || c.deletedAt !== null) return fail(404, 'not_found', 'Comment was not found')
  const page = pageFor(c.pageId, userId)
  return page instanceof Response ? page : { c, page }
}

function item(page: FakePage, viewedAt: string | null = null): PageItemDto {
  const space = fakeDb.spaces.get(page.spaceId)!
  return {
    id: page.id,
    title: page.title,
    icon: page.icon,
    status: page.status,
    hasDraft: page.status === 'published' && page.draft !== null,
    spaceId: space.id,
    spaceKey: space.key,
    spaceName: space.name,
    updatedAt: page.updatedAt,
    updatedById: page.updatedById,
    viewedAt,
  }
}

const bodyText = (p: FakePage) => (p.publishedHtml ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** A plain snippet around the first occurrence of any query word, the words marked like `ts_headline`. */
function snippet(text: string, words: string[]) {
  const lower = text.toLowerCase()
  const first = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), Number.POSITIVE_INFINITY)
  const start = Number.isFinite(first) ? Math.max(0, first - 60) : 0
  let piece = text.slice(start, start + 240)
  for (const w of words) piece = piece.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), `${SNIPPET_START}$1${SNIPPET_STOP}`)
  return parseSnippet(piece)
}

export const contentHandlers = [
  http.get('*/api/pages/:id/comments', withUser(({ params }, user) => {
    const page = pageFor(params.id as string, user.id)
    return page instanceof Response ? page : HttpResponse.json(threads(page.id))
  })),

  http.post('*/api/pages/:id/comments', withUser(async ({ params, request }, user) => {
    const page = pageFor(params.id as string, user.id)
    if (page instanceof Response) return page
    if (!pageAccess(page, user.id).comment) return fail(403, 'forbidden', 'You cannot comment on this page')
    const input = await body(request, commentCreateSchema)
    if (input instanceof Response) return input
    const at = now()
    const c: FakeComment = { id: crypto.randomUUID(), pageId: page.id, parentId: null, authorId: user.id, body: input.body, anchorText: input.anchorText, resolvedAt: null, deletedAt: null, createdAt: at, updatedAt: at }
    fakeDb.comments.set(c.id, c)
    return HttpResponse.json(commentDto(c), { status: 201 })
  })),

  http.post('*/api/comments/:id/replies', withUser(async ({ params, request }, user) => {
    const found = liveComment(params.id as string, user.id)
    if (found instanceof Response) return found
    if (!pageAccess(found.page, user.id).comment) return fail(403, 'forbidden', 'You cannot comment on this page')
    const input = await body(request, commentBodySchema)
    if (input instanceof Response) return input
    const at = now()
    const c: FakeComment = { id: crypto.randomUUID(), pageId: found.page.id, parentId: found.c.parentId ?? found.c.id, authorId: user.id, body: input.body, anchorText: null, resolvedAt: null, deletedAt: null, createdAt: at, updatedAt: at }
    fakeDb.comments.set(c.id, c)
    return HttpResponse.json(commentDto(c), { status: 201 })
  })),

  http.patch('*/api/comments/:id', withUser(async ({ params, request }, user) => {
    const found = liveComment(params.id as string, user.id)
    if (found instanceof Response) return found
    if (found.c.authorId !== user.id) return fail(403, 'forbidden', 'Only the author can edit a comment')
    const input = await body(request, commentBodySchema)
    if (input instanceof Response) return input
    Object.assign(found.c, { body: input.body, updatedAt: now() })
    return HttpResponse.json(commentDto(found.c))
  })),

  http.delete('*/api/comments/:id', withUser(({ params }, user) => {
    const found = liveComment(params.id as string, user.id)
    if (found instanceof Response) return found
    const spaceAdmin = visibleSpace(found.page.spaceId, user.id)?.access.admin
    if (found.c.authorId !== user.id && !spaceAdmin) return fail(403, 'forbidden', 'Only the author or a space admin can delete a comment')
    found.c.deletedAt = now()
    return new HttpResponse(null, { status: 204 })
  })),

  ...(['resolve', 'reopen'] as const).map((action) =>
    http.post(`*/api/comments/:id/${action}`, withUser(({ params }, user) => {
      const found = liveComment(params.id as string, user.id)
      if (found instanceof Response) return found
      if (found.c.parentId) return fail(400, 'reply', 'Resolve the thread, not a reply')
      if (!pageAccess(found.page, user.id).comment) return fail(403, 'forbidden', 'You cannot comment on this page')
      found.c.resolvedAt = action === 'resolve' ? now() : null
      return HttpResponse.json(commentDto(found.c, threads(found.page.id).find((t) => t.id === found.c.id)?.replies))
    })),
  ),

  http.get('*/api/me/recent', withUser((_i, user) => {
    const rows = [...fakeDb.recentViews.entries()]
      .filter(([k]) => k.startsWith(`${user.id}:`))
      .map(([k, at]) => ({ page: fakeDb.pages.get(k.slice(user.id.length + 1)), at }))
      .filter((r): r is { page: FakePage; at: string } => Boolean(r.page && LIVE.has(r.page.status) && canSeePage(r.page, user.id)))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
    return HttpResponse.json(rows.map((r) => item(r.page, r.at)))
  })),

  http.get('*/api/me/starred', withUser((_i, user) => {
    const spaces = [...fakeDb.spaces.values()].filter((s) => fakeDb.spaceStars.has(`${user.id}:${s.id}`) && visibleSpace(s.id, user.id)).sort((a, b) => a.name.localeCompare(b.name))
    const pages = [...fakeDb.pages.values()].filter((p) => fakeDb.pageStars.has(`${user.id}:${p.id}`) && LIVE.has(p.status) && canSeePage(p, user.id))
    const dto: StarredDto = { spaces: spaces.map((s) => spaceDto(s, user.id)), pages: pages.map((p) => item(p)) }
    return HttpResponse.json(dto)
  })),

  http.get('*/api/me/drafts', withUser((_i, user) => {
    const mine = [...fakeDb.pages.values()].filter(
      (p) => canSeePage(p, user.id) && ((p.status === 'draft' && p.ownerId === user.id) || (p.status === 'published' && p.draft?.updatedById === user.id)),
    )
    const when = (p: FakePage) => p.draft?.updatedAt ?? p.updatedAt
    return HttpResponse.json(mine.sort((a, b) => when(b).localeCompare(when(a))).slice(0, 20).map((p) => item(p)))
  })),

  http.get('*/api/labels', withUser(({ request }, user) => {
    const params = new URL(request.url).searchParams
    const q = params.get('q')?.trim().toLowerCase() ?? ''
    const space = params.get('space') ? visibleSpace(params.get('space')!, user.id)?.space : undefined
    const counts = new Map<string, number>()
    for (const p of fakeDb.pages.values()) {
      if (!LIVE.has(p.status) || !canSeePage(p, user.id)) continue
      if (params.get('space') && p.spaceId !== space?.id) continue
      for (const l of p.labels) if (l.startsWith(q)) counts.set(l, (counts.get(l) ?? 0) + 1)
    }
    const rows: LabelCountDto[] = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return HttpResponse.json(rows.slice(0, 20))
  })),

  http.get('*/api/search', withUser(({ request }, user) => {
    const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return fail(400, 'invalid_request', parsed.error.issues[0].message)
    const input = parsed.data
    const offset = input.cursor ? Number(atob(input.cursor.replace(/-/g, '+').replace(/_/g, '/'))) : 0
    if (!Number.isInteger(offset) || offset < 0) return fail(400, 'invalid_cursor', 'That page of results is no longer available')
    const words = input.q.toLowerCase().split(/\s+/).filter(Boolean)
    const days = input.modified ? SEARCH_MODIFIED[input.modified] : 0

    const matches = (p: FakePage, omit?: SearchFilter) => {
      const f = (k: SearchFilter) => k !== omit && input[k] !== undefined
      const space = fakeDb.spaces.get(p.spaceId)!
      if (p.status !== 'published' || !canSeePage(p, user.id)) return false
      const haystack = `${p.title} ${bodyText(p)}`.toLowerCase()
      if (words.length && !words.some((w) => haystack.includes(w))) return false
      if (f('space') && space.key !== input.space!.toUpperCase() && space.id !== input.space) return false
      if (f('type') && p.isBlogPost !== (input.type === 'blog')) return false
      if (f('contributor') && p.updatedById !== input.contributor && p.ownerId !== input.contributor) return false
      if (f('modified') && Date.now() - new Date(p.updatedAt).getTime() > days * 86_400_000) return false
      if (f('label') && !p.labels.includes(input.label!.toLowerCase())) return false
      return true
    }
    const score = (p: FakePage) => words.reduce((n, w) => n + (p.title.toLowerCase().includes(w) ? 10 : 0) + (bodyText(p).toLowerCase().includes(w) ? 1 : 0), 0)
    const all = [...fakeDb.pages.values()].filter((p) => matches(p))
    all.sort((a, b) => (input.sort === 'relevance' && words.length ? score(b) - score(a) : 0) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    const page = all.slice(offset, offset + input.limit)
    const next = offset + page.length
    const dto: SearchResponseDto = {
      results: page.map((p) => {
        const space = fakeDb.spaces.get(p.spaceId)!
        return {
          id: p.id,
          title: p.title,
          icon: p.icon,
          spaceId: space.id,
          spaceKey: space.key,
          spaceName: space.name,
          isBlogPost: p.isBlogPost,
          ownerId: p.ownerId,
          updatedById: p.updatedById,
          updatedAt: p.updatedAt,
          labels: [...p.labels].sort(),
          snippet: snippet(bodyText(p), words),
        }
      }),
      total: all.length,
      nextCursor: next < all.length ? btoa(String(next)).replace(/=+$/, '') : null,
      relaxed: Object.fromEntries(SEARCH_FILTERS.filter((k) => input[k] !== undefined).map((k) => [k, [...fakeDb.pages.values()].filter((p) => matches(p, k)).length])),
    }
    return HttpResponse.json(dto)
  })),

  http.get('*/api/search/quick', withUser(({ request }, user) => {
    const params = new URL(request.url).searchParams
    const q = (params.get('q') ?? '').trim().toLowerCase()
    if (!q) return HttpResponse.json<QuickSearchDto>({ pages: [], spaces: [] })
    const scope = params.get('space') ? visibleSpace(params.get('space')!, user.id)?.space : undefined
    const pages = [...fakeDb.pages.values()]
      .filter((p) => LIVE.has(p.status) && canSeePage(p, user.id) && p.title.toLowerCase().includes(q) && (!params.get('space') || p.spaceId === scope?.id))
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)) || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((p) => {
        const space = fakeDb.spaces.get(p.spaceId)!
        return { id: p.id, title: p.title, icon: p.icon, spaceId: space.id, spaceKey: space.key, spaceName: space.name, updatedAt: p.updatedAt }
      })
    const spaces = [...fakeDb.spaces.values()]
      .filter((s) => visibleSpace(s.id, user.id) && (s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((s) => ({ id: s.id, key: s.key, name: s.name, icon: s.icon }))
    return HttpResponse.json<QuickSearchDto>({ pages, spaces })
  })),
]
