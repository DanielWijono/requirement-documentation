import {
  collaboratorsSchema,
  draftSaveSchema,
  evaluatePageAccess,
  labelsSchema,
  pageCopySchema,
  pageCreateSchema,
  pageMoveSchema,
  pagePatchSchema,
  pageRestrictionsSchema,
  publishSchema,
  type PageAccess,
  type PageDto,
  type PageFacts,
  type PageRestrictionsDto,
  type PageTreeDto,
  type PrincipalDto,
  type PrincipalRef,
} from '@quire/shared'
import { http, HttpResponse } from 'msw'
import { fakeDb, type FakePage, type FakeRestriction, type FakeSpace } from './db'
import { visibleSpace } from './spaces'
import { body, fail, withUser, type ResolverInfo } from './util'

/** The pages family of the fake API: same rules as `quire-api/src/routes/pages.ts`. */

const LIVE = new Set(['draft', 'published'])
const now = () => new Date().toISOString()

function spaceFacts(space: FakeSpace) {
  return { ownerId: space.ownerId, archived: space.archived, grants: space.grants }
}

export function ancestors(page: FakePage): FakePage[] {
  const chain: FakePage[] = []
  let parent = page.parentId ? fakeDb.pages.get(page.parentId) : undefined
  while (parent) {
    chain.unshift(parent)
    parent = parent.parentId ? fakeDb.pages.get(parent.parentId) : undefined
  }
  return chain
}

const ref = (r: FakeRestriction): PrincipalRef => ({ type: r.principalType, id: r.principalId })

function pageFacts(page: FakePage): PageFacts {
  const viewLists = [...ancestors(page), page].map((p) => p.restrictions.filter((r) => r.kind === 'view').map(ref)).filter((l) => l.length > 0)
  return {
    ownerId: page.ownerId,
    status: page.status,
    collaboratorIds: page.collaborators,
    viewLists,
    editList: page.restrictions.filter((r) => r.kind === 'edit').map(ref),
  }
}

export function pageAccess(page: FakePage, userId: string): PageAccess {
  const space = fakeDb.spaces.get(page.spaceId)!
  return evaluatePageAccess(fakeDb.subject(userId), spaceFacts(space), pageFacts(page))
}

export function canSeePage(page: FakePage, userId: string) {
  return fakeDb.spaces.has(page.spaceId) && pageAccess(page, userId).view
}

/** Like `pageForSubject`: 404 for a missing page or hidden space, 403 for a restricted one. */
function loadPage(id: string, userId: string): { page: FakePage; access: PageAccess } | Response {
  const page = fakeDb.pages.get(id)
  if (!page || !visibleSpace(page.spaceId, userId)) return fail(404, 'not_found', 'Page was not found')
  const access = pageAccess(page, userId)
  if (!access.view) return fail(403, 'forbidden', 'This page is restricted')
  return { page, access }
}

export function pageDto(page: FakePage, userId: string): PageDto {
  const access = pageAccess(page, userId)
  return {
    id: page.id,
    spaceId: page.spaceId,
    spaceKey: fakeDb.spaces.get(page.spaceId)!.key,
    parentId: page.parentId,
    ancestors: ancestors(page).map((p) => ({ id: p.id, title: p.title })),
    title: page.title,
    icon: page.icon,
    status: page.status,
    ownerId: page.ownerId,
    updatedById: page.updatedById,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    publishedHtml: page.publishedHtml,
    publishedVersion: page.publishedVersion,
    lockVersion: page.lockVersion,
    wordCount: page.wordCount,
    widthMode: page.widthMode,
    isBlogPost: page.isBlogPost,
    labels: [...page.labels].sort(),
    restricted: page.restrictions.length > 0,
    starred: fakeDb.pageStars.has(`${userId}:${page.id}`),
    watched: fakeDb.pageWatches.has(`${userId}:${page.id}`),
    draft: access.edit && page.draft ? { ...page.draft } : null,
    myAccess: access,
  }
}

const ok = (page: FakePage, userId: string, status = 200) =>
  HttpResponse.json(pageDto(page, userId), { status, headers: { etag: `"${page.lockVersion}"` } })
const forbidden = (message: string) => fail(403, 'forbidden', message)

function ifMatch(request: Request): number | null | Response {
  const header = request.headers.get('if-match')
  if (!header) return null
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim())
  return m ? Number(m[1]) : fail(400, 'invalid_if_match', 'If-Match must be a version number')
}

const siblingsOf = (spaceId: string, parentId: string | null, excludeId?: string) =>
  [...fakeDb.pages.values()]
    .filter((p) => p.spaceId === spaceId && p.parentId === parentId && LIVE.has(p.status) && p.id !== excludeId)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

function positionAt(spaceId: string, parentId: string | null, index: number, excludeId?: string) {
  const others = siblingsOf(spaceId, parentId, excludeId)
  if (others.length === 0) return 1
  if (index <= 0) return others[0].position - 1
  if (index >= others.length) return others[others.length - 1].position + 1
  return (others[index - 1].position + others[index].position) / 2
}

function subtree(page: FakePage): FakePage[] {
  const out = [page]
  for (const p of fakeDb.pages.values()) if (p.parentId === page.id) out.push(...subtree(p))
  return out
}

/** Where a new or moved page may go (see `destination` in the API). */
function destination(spaceKey: string, parentId: string | null, userId: string): { space: FakeSpace } | Response {
  const found = visibleSpace(spaceKey, userId)
  if (!found) return fail(404, 'not_found', 'Space was not found')
  if (parentId === null) return found.access.addPage ? { space: found.space } : forbidden('You cannot add pages to this space')
  const parent = loadPage(parentId, userId)
  if (parent instanceof Response) return parent.status === 403 ? fail(400, 'invalid_parent', 'The parent page does not exist') : parent
  if (parent.page.spaceId !== found.space.id) return fail(400, 'cross_space', 'Pages can only be placed under a page in the same space')
  if (!LIVE.has(parent.page.status)) return fail(400, 'invalid_parent', 'The parent page is in the trash')
  return parent.access.addChild ? { space: found.space } : forbidden('You cannot add pages under that page')
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const words = (html: string) => (text(html) ? text(html).split(' ').length : 0)

function publish(page: FakePage, userId: string, html: string, comment: string) {
  const at = now()
  page.status = 'published'
  page.publishedHtml = html
  page.wordCount = words(html)
  page.publishedVersion += 1
  page.lockVersion += 1
  page.updatedById = userId
  page.updatedAt = at
  page.versions.unshift({ version: page.publishedVersion, html, title: page.title, authorId: userId, comment, createdAt: at })
  fakeDb.spaces.get(page.spaceId)!.lastActivityAt = at
}

function newPage(over: Partial<FakePage> & Pick<FakePage, 'spaceId' | 'parentId' | 'title' | 'ownerId'>): FakePage {
  const at = now()
  return {
    id: crypto.randomUUID(),
    position: 1,
    icon: null,
    status: 'draft',
    statusBeforeTrash: null,
    updatedById: over.ownerId,
    publishedHtml: null,
    publishedVersion: 0,
    lockVersion: 0,
    wordCount: 0,
    widthMode: 'reading',
    isBlogPost: false,
    createdAt: at,
    updatedAt: at,
    draft: null,
    versions: [],
    restrictions: [],
    collaborators: [],
    labels: [],
    ...over,
  }
}

function principalName(p: PrincipalRef) {
  return (p.type === 'user' ? fakeDb.users.get(p.id)?.name : fakeDb.groups.get(p.id)?.name) ?? p.id
}

function restrictionsDto(page: FakePage): PageRestrictionsDto {
  const dto = (list: FakeRestriction[]): PrincipalDto[] =>
    list
      .map((r) => ({ type: r.principalType, id: r.principalId, name: principalName(ref(r)) }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  return {
    view: dto(page.restrictions.filter((r) => r.kind === 'view')),
    edit: dto(page.restrictions.filter((r) => r.kind === 'edit')),
    inherited: ancestors(page)
      .reverse()
      .filter((a) => a.restrictions.some((r) => r.kind === 'view'))
      .map((a) => ({ pageId: a.id, title: a.title, view: dto(a.restrictions.filter((r) => r.kind === 'view')) })),
  }
}

/** Resolve a page and run `fn` when the person can see it. */
function onPage(fn: (info: ResolverInfo, userId: string, page: FakePage, access: PageAccess) => Response | Promise<Response>) {
  return withUser((info, user) => {
    const found = loadPage(info.params.id as string, user.id)
    return found instanceof Response ? found : fn(info, user.id, found.page, found.access)
  })
}

export function treeNodes(spaceId: string, userId: string): PageTreeDto[] {
  const visible = [...fakeDb.pages.values()]
    .filter((p) => p.spaceId === spaceId && LIVE.has(p.status) && canSeePage(p, userId))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
  const nodes = new Map<string, PageTreeDto>(
    visible.map((p) => [
      p.id,
      {
        id: p.id,
        parentId: p.parentId,
        title: p.title,
        icon: p.icon,
        status: p.status,
        hasDraft: p.status === 'published' && p.draft !== null,
        restricted: p.restrictions.length > 0,
        hasChildren: false,
        updatedAt: p.updatedAt,
        children: [],
      },
    ]),
  )
  const roots: PageTreeDto[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) {
      parent.children.push(node)
      parent.hasChildren = true
    } else roots.push(node)
  }
  return roots
}

function toggle(kind: 'star' | 'watch') {
  const set = () => (kind === 'star' ? fakeDb.pageStars : fakeDb.pageWatches)
  return [
    http.put(`*/api/pages/:id/${kind}`, onPage((_i, userId, page) => {
      set().add(`${userId}:${page.id}`)
      return new HttpResponse(null, { status: 204 })
    })),
    http.delete(`*/api/pages/:id/${kind}`, onPage((_i, userId, page) => {
      set().delete(`${userId}:${page.id}`)
      return new HttpResponse(null, { status: 204 })
    })),
  ]
}

export const pageHandlers = [
  http.get('*/api/spaces/:key/tree', withUser(({ params, request }, user) => {
    const found = visibleSpace(params.key as string, user.id)
    if (!found) return fail(404, 'not_found', 'Space was not found')
    const url = new URL(request.url)
    if (url.searchParams.get('trash') === '1') {
      const trashed = (p: FakePage) => p.status === 'archived' || p.status === 'deleted'
      const roots = [...fakeDb.pages.values()].filter((p) => p.spaceId === found.space.id && trashed(p) && canSeePage(p, user.id) && !(p.parentId && trashed(fakeDb.pages.get(p.parentId)!)))
      return HttpResponse.json(
        roots.map((p) => ({ id: p.id, parentId: p.parentId, title: p.title, icon: p.icon, status: p.status, hasDraft: false, restricted: p.restrictions.length > 0, hasChildren: false, updatedAt: p.updatedAt })),
      )
    }
    const all = treeNodes(found.space.id, user.id)
    if (url.searchParams.get('all') === '1') return HttpResponse.json(all)
    const parentId = url.searchParams.get('parentId')
    const find = (nodes: PageTreeDto[]): PageTreeDto[] => {
      for (const n of nodes) {
        if (n.id === parentId) return n.children
        const inner = find(n.children)
        if (inner.length) return inner
      }
      return []
    }
    const level = parentId ? find(all) : all
    return HttpResponse.json(level.map((n) => ({ ...n, children: undefined })))
  })),

  http.post('*/api/pages', withUser(async ({ request }, user) => {
    const input = await body(request, pageCreateSchema)
    if (input instanceof Response) return input
    const dest = destination(input.spaceKey, input.parentId, user.id)
    if (dest instanceof Response) return dest
    const page = newPage({
      spaceId: dest.space.id,
      parentId: input.parentId,
      position: positionAt(dest.space.id, input.parentId, Number.MAX_SAFE_INTEGER),
      title: input.title,
      icon: input.icon,
      isBlogPost: input.isBlogPost,
      ownerId: user.id,
      draft: { html: input.html, rev: 1, updatedAt: now(), updatedById: user.id },
    })
    fakeDb.pages.set(page.id, page)
    dest.space.lastActivityAt = now()
    return ok(page, user.id, 201)
  })),

  http.get('*/api/pages/:id', onPage((_i, userId, page) => ok(page, userId))),

  http.patch('*/api/pages/:id', onPage(async ({ request }, userId, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const expected = ifMatch(request)
    if (expected instanceof Response) return expected
    const input = await body(request, pagePatchSchema)
    if (input instanceof Response) return input
    if (expected !== null && expected !== page.lockVersion) return HttpResponse.json({ code: 'page_conflict', message: 'Someone else changed this page', current: pageDto(page, userId) }, { status: 409 })
    Object.assign(page, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)))
    page.lockVersion += 1
    page.updatedById = userId
    page.updatedAt = now()
    return ok(page, userId)
  })),

  http.put('*/api/pages/:id/draft', onPage(async ({ request }, userId, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const expected = ifMatch(request)
    if (expected instanceof Response) return expected
    const input = await body(request, draftSaveSchema)
    if (input instanceof Response) return input
    const matches = expected === null ? page.draft === null : page.draft?.rev === expected
    if (!matches) return HttpResponse.json({ code: 'draft_conflict', message: 'Someone else saved this draft', current: page.draft }, { status: 409 })
    page.draft = { html: input.html, rev: (page.draft?.rev ?? 0) + 1, updatedAt: now(), updatedById: userId }
    return HttpResponse.json(page.draft, { headers: { etag: `"${page.draft.rev}"` } })
  })),

  http.delete('*/api/pages/:id/draft', onPage((_i, _u, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    if (page.status === 'draft') return fail(400, 'unpublished', 'A page that was never published has no other version to go back to')
    page.draft = null
    return new HttpResponse(null, { status: 204 })
  })),

  http.post('*/api/pages/:id/publish', onPage(async ({ request }, userId, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const expected = ifMatch(request)
    if (expected instanceof Response) return expected
    if (expected === null) return fail(428, 'precondition_required', 'Send the version you started from in If-Match')
    const input = await body(request, publishSchema)
    if (input instanceof Response) return input
    if (!page.draft) return fail(400, 'nothing_to_publish', 'There are no changes to publish')
    if (expected !== page.lockVersion) return HttpResponse.json({ code: 'page_conflict', message: 'Someone else published this page', current: pageDto(page, userId) }, { status: 409 })
    publish(page, userId, page.draft.html, input.comment)
    page.draft = null
    return ok(page, userId)
  })),

  http.get('*/api/pages/:id/versions', onPage((_i, _u, page) =>
    HttpResponse.json(page.versions.map((v) => ({ version: v.version, title: v.title, authorId: v.authorId, comment: v.comment, createdAt: v.createdAt })).sort((a, b) => b.version - a.version)),
  )),

  http.get('*/api/pages/:id/versions/:version', onPage(({ params }, _u, page) => {
    const v = page.versions.find((x) => x.version === Number(params.version))
    return v ? HttpResponse.json(v) : fail(404, 'not_found', 'Version was not found')
  })),

  http.post('*/api/pages/:id/versions/:version/restore', onPage(({ params, request }, userId, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const expected = ifMatch(request)
    if (expected instanceof Response) return expected
    if (expected === null) return fail(428, 'precondition_required', 'Send the version you started from in If-Match')
    const v = page.versions.find((x) => x.version === Number(params.version))
    if (!v) return fail(404, 'not_found', 'Version was not found')
    if (v.html === null) return fail(400, 'version_unavailable', 'That version has no saved content to restore')
    if (expected !== page.lockVersion) return HttpResponse.json({ code: 'page_conflict', message: 'Someone else published this page', current: pageDto(page, userId) }, { status: 409 })
    publish(page, userId, v.html, `Restored version ${v.version}`)
    return ok(page, userId)
  })),

  http.post('*/api/pages/:id/move', onPage(async ({ request }, userId, page, access) => {
    if (!LIVE.has(page.status)) return fail(400, 'in_trash', 'Restore the page before moving it')
    if (!access.edit) return forbidden('You cannot move this page')
    const input = await body(request, pageMoveSchema)
    if (input instanceof Response) return input
    if (input.parentId !== null && subtree(page).some((p) => p.id === input.parentId)) return fail(400, 'move_cycle', 'A page cannot move below itself')
    const dest = destination(page.spaceId, input.parentId, userId)
    if (dest instanceof Response) return dest
    page.position = positionAt(page.spaceId, input.parentId, input.index, page.id)
    page.parentId = input.parentId
    page.lockVersion += 1
    return ok(page, userId)
  })),

  http.post('*/api/pages/:id/copy', onPage(async ({ request }, userId, page, access) => {
    const input = await body(request, pageCopySchema)
    if (input instanceof Response) return input
    const dest = destination(page.spaceId, page.parentId, userId)
    if (dest instanceof Response) return dest
    const index = siblingsOf(page.spaceId, page.parentId).findIndex((s) => s.id === page.id) + 1
    const html = (access.edit ? page.draft?.html : undefined) ?? page.publishedHtml ?? '<p></p>'
    const copy = newPage({
      spaceId: page.spaceId,
      parentId: page.parentId,
      position: positionAt(page.spaceId, page.parentId, index),
      title: input.title ?? `Copy of ${page.title}`,
      icon: page.icon,
      widthMode: page.widthMode,
      isBlogPost: page.isBlogPost,
      ownerId: userId,
      draft: { html, rev: 1, updatedAt: now(), updatedById: userId },
    })
    fakeDb.pages.set(copy.id, copy)
    return ok(copy, userId, 201)
  })),

  ...(['archive', 'delete', 'restore'] as const).map((action) =>
    http.post(`*/api/pages/:id/${action}`, onPage((_i, userId, page, access) => {
      if (!access.delete) return forbidden('You cannot archive or delete this page')
      const inTrash = !LIVE.has(page.status)
      if (action === 'restore' && !inTrash) return fail(400, 'not_in_trash', 'This page is not in the trash')
      if (action === 'archive' && inTrash) return fail(400, 'in_trash', 'This page is already in the trash')
      if (action === 'delete' && page.status === 'deleted') return fail(400, 'in_trash', 'This page is already deleted')
      for (const p of subtree(page)) {
        if (action === 'restore') {
          if (LIVE.has(p.status)) continue
          p.status = p.statusBeforeTrash ?? 'published'
          p.statusBeforeTrash = null
        } else if (LIVE.has(p.status)) {
          p.statusBeforeTrash = p.status as 'draft' | 'published'
          p.status = action === 'archive' ? 'archived' : 'deleted'
        } else if (action === 'delete') p.status = 'deleted'
        else continue
        p.lockVersion += 1
      }
      if (action === 'restore' && page.parentId && !LIVE.has(fakeDb.pages.get(page.parentId)!.status)) {
        page.position = positionAt(page.spaceId, null, Number.MAX_SAFE_INTEGER, page.id)
        page.parentId = null
      }
      return ok(page, userId)
    })),
  ),

  http.get('*/api/pages/:id/restrictions', onPage((_i, _u, page) => HttpResponse.json(restrictionsDto(page)))),

  http.put('*/api/pages/:id/restrictions', onPage(async ({ request }, userId, page, access) => {
    if (!access.restrict) return forbidden('You cannot change restrictions on this page')
    const input = await body(request, pageRestrictionsSchema)
    if (input instanceof Response) return input
    const me: PrincipalRef = { type: 'user', id: userId }
    const withMe = (list: PrincipalRef[]) => (list.length ? [me, ...list] : list)
    const lists = { view: withMe(input.view), edit: withMe(input.edit) }
    const all = [...lists.view, ...lists.edit]
    if (all.some((p) => (p.type === 'user' ? !fakeDb.users.has(p.id) : !fakeDb.groups.has(p.id)))) return fail(400, 'unknown_principal', 'One or more people or groups do not exist')
    const unique = (kind: 'view' | 'edit') => [...new Map(lists[kind].map((p) => [`${p.type}:${p.id}`, p])).values()].map((p) => ({ kind, principalType: p.type, principalId: p.id }))
    page.restrictions = [...unique('view'), ...unique('edit')]
    return HttpResponse.json(restrictionsDto(page))
  })),

  http.get('*/api/pages/:id/collaborators', onPage((_i, _u, page) =>
    HttpResponse.json(page.collaborators.map((id) => fakeDb.userDto(id)).sort((a, b) => a.name.localeCompare(b.name))),
  )),

  http.put('*/api/pages/:id/collaborators', onPage(async ({ request }, _u, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const input = await body(request, collaboratorsSchema)
    if (input instanceof Response) return input
    const ids = [...new Set(input.userIds)]
    if (ids.some((id) => !fakeDb.users.get(id) || fakeDb.users.get(id)!.deactivated)) return fail(400, 'unknown_user', 'One or more people do not exist')
    page.collaborators = ids
    return HttpResponse.json(ids.map((id) => fakeDb.userDto(id)).sort((a, b) => a.name.localeCompare(b.name)))
  })),

  http.put('*/api/pages/:id/labels', onPage(async ({ request }, _u, page, access) => {
    if (!access.edit) return forbidden('You cannot edit this page')
    const input = await body(request, labelsSchema)
    if (input instanceof Response) return input
    page.labels = [...new Set(input.labels)]
    return HttpResponse.json([...page.labels].sort())
  })),

  http.post('*/api/pages/:id/views', onPage((_i, userId, page) => {
    fakeDb.recentViews.set(`${userId}:${page.id}`, now())
    return new HttpResponse(null, { status: 204 })
  })),

  ...toggle('star'),
  ...toggle('watch'),
]

/** Published pages the space's count shows. */
export function publishedCount(spaceId: string) {
  return [...fakeDb.pages.values()].filter((p) => p.spaceId === spaceId && p.status === 'published').length
}
