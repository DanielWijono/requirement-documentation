import {
  relativeTime,
  type DraftDto,
  type PageCreate,
  type PageDto,
  type PageMove,
  type PagePatch,
  type PageRestrictionsDto,
  type PageRestrictionsInput,
  type PageTreeDto,
  type PageVersionDetailDto,
  type PageVersionDto,
  type UserDto,
} from '@quire/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Page, PageState, PageTreeNode, PageVersion } from '../types'
import { spacesKey } from './spaces'

/** Query keys. Everything about one page lives under ['page', id] so one invalidation refreshes it all. */
export const pageKeys = {
  tree: (spaceId: string) => ['tree', spaceId] as const,
  trash: (spaceId: string) => ['tree', spaceId, 'trash'] as const,
  page: (pageId: string) => ['page', pageId] as const,
  versions: (pageId: string) => ['page', pageId, 'versions'] as const,
  version: (pageId: string, version: number) => ['page', pageId, 'versions', version] as const,
  restrictions: (pageId: string) => ['page', pageId, 'restrictions'] as const,
  collaborators: (pageId: string) => ['page', pageId, 'collaborators'] as const,
}

export function pageState(status: PageDto['status'], hasDraft: boolean): PageState {
  return status === 'published' && hasDraft ? 'published-unpublished-changes' : status
}

export function readTime(wordCount: number) {
  return `${Math.max(1, Math.round(wordCount / 200))} min read`
}

/** The web's Page model from the API's DTO. Comments and versions load separately. */
export function toPage(dto: PageDto): Page {
  return {
    id: dto.id,
    spaceId: dto.spaceId,
    parentId: dto.parentId,
    title: dto.title,
    icon: dto.icon ?? undefined,
    ownerId: dto.ownerId,
    updatedById: dto.updatedById,
    updatedRelative: relativeTime(dto.updatedAt),
    readTime: readTime(dto.wordCount),
    state: pageState(dto.status, dto.draft !== null && dto.publishedVersion > 0),
    restricted: dto.restricted,
    labels: dto.labels.map((name) => ({ name })),
    widthMode: dto.widthMode,
    contentHtml: dto.draft?.html ?? dto.publishedHtml ?? '<p></p>',
    publishedHtml: dto.publishedHtml ?? undefined,
    comments: [],
    versions: [],
    wordCount: dto.wordCount,
    isBlogPost: dto.isBlogPost,
    starred: dto.starred,
    watched: dto.watched,
    access: dto.myAccess,
    lockVersion: dto.lockVersion,
    draftRev: dto.draft?.rev,
    publishedVersion: dto.publishedVersion,
    ancestors: dto.ancestors,
    createdAt: dto.createdAt,
  }
}

function toTreeNode(dto: PageTreeDto): PageTreeNode {
  return {
    id: dto.id,
    title: dto.title,
    icon: dto.icon ?? undefined,
    state: pageState(dto.status, dto.hasDraft),
    restricted: dto.restricted || undefined,
    children: dto.children.map(toTreeNode),
  }
}

const EMPTY_TREE: PageTreeNode[] = []

/** The whole visible tree of a space. */
export function usePageTreeQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: pageKeys.tree(spaceId ?? ''),
    queryFn: () => api.get<PageTreeDto[]>(`/spaces/${spaceId}/tree?all=1`),
    select: (nodes) => nodes.map(toTreeNode),
    enabled: Boolean(spaceId),
  })
}

export function usePageTree(spaceId: string | undefined): PageTreeNode[] {
  return usePageTreeQuery(spaceId).data ?? EMPTY_TREE
}

/** Archived and deleted pages at the top of the trash, with when they changed. */
export function useTrash(spaceId: string) {
  return useQuery({
    queryKey: pageKeys.trash(spaceId),
    queryFn: () => api.get<(Omit<PageTreeDto, 'children'> & { updatedAt: string })[]>(`/spaces/${spaceId}/tree?trash=1`),
  })
}

/** One page. 404 and 403 surface as the query's error (an ApiError with that status). */
export function usePageQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: pageKeys.page(pageId ?? ''),
    queryFn: () => api.get<PageDto>(`/pages/${pageId}`),
    select: toPage,
    enabled: Boolean(pageId),
  })
}

export function usePage(pageId: string | undefined): Page | undefined {
  return usePageQuery(pageId).data
}

export function useVersions(page: Pick<Page, 'id' | 'publishedVersion'>) {
  return useQuery({
    queryKey: pageKeys.versions(page.id),
    queryFn: () => api.get<PageVersionDto[]>(`/pages/${page.id}/versions`),
    select: (rows): PageVersion[] =>
      rows.map((v) => ({ version: v.version, authorId: v.authorId, comment: v.comment, relativeTime: relativeTime(v.createdAt), current: v.version === page.publishedVersion })),
  })
}

/** A version's body; null when it was imported without one. */
export function useVersionHtml(pageId: string, version: number | null | undefined) {
  return useQuery({
    queryKey: pageKeys.version(pageId, version ?? -1),
    queryFn: () => api.get<PageVersionDetailDto>(`/pages/${pageId}/versions/${version}`),
    select: (v) => v.html,
    enabled: version !== null && version !== undefined,
    staleTime: Infinity,
  })
}

export function useRestrictions(pageId: string, enabled = true) {
  return useQuery({ queryKey: pageKeys.restrictions(pageId), queryFn: () => api.get<PageRestrictionsDto>(`/pages/${pageId}/restrictions`), enabled })
}

export function useCollaborators(pageId: string, enabled = true) {
  return useQuery({ queryKey: pageKeys.collaborators(pageId), queryFn: () => api.get<UserDto[]>(`/pages/${pageId}/collaborators`), enabled })
}

// ---------------------------------------------------------------------------
// Mutations

/** After anything that changes a page: refresh it, its space's tree, and every list that shows pages. */
export async function refreshPage(qc: QueryClient, pageId: string, spaceId?: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: pageKeys.page(pageId) }),
    spaceId ? qc.invalidateQueries({ queryKey: ['tree', spaceId] }) : Promise.resolve(),
    qc.invalidateQueries({ queryKey: ['home'] }),
    qc.invalidateQueries({ queryKey: ['search'] }),
    qc.invalidateQueries({ queryKey: spacesKey }),
  ])
}

export function useCreatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PageCreate) => api.post<PageDto>('/pages', input),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

/** Save the working copy. `rev` is the draft revision the client last saw (none for a new draft). */
export function saveDraft(pageId: string, html: string, rev: number | undefined) {
  return api.put<DraftDto>(`/pages/${pageId}/draft`, { html }, rev === undefined ? {} : { ifMatch: rev })
}

export function usePublish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ page, comment = '' }: { page: Pick<Page, 'id' | 'lockVersion'>; comment?: string }) =>
      api.post<PageDto>(`/pages/${page.id}/publish`, { comment }, { ifMatch: page.lockVersion ?? 0 }),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void qc.invalidateQueries({ queryKey: pageKeys.versions(page.id) })
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

export function usePatchPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ page, patch }: { page: Pick<Page, 'id' | 'lockVersion'>; patch: PagePatch }) =>
      api.patch<PageDto>(`/pages/${page.id}`, patch, page.lockVersion === undefined ? {} : { ifMatch: page.lockVersion }),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

export function useDiscardDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (page: Pick<Page, 'id' | 'spaceId'>) => api.delete(`/pages/${page.id}/draft`),
    onSuccess: (_r, page) => void refreshPage(qc, page.id, page.spaceId),
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ page, version }: { page: Pick<Page, 'id' | 'lockVersion'>; version: number }) =>
      api.post<PageDto>(`/pages/${page.id}/versions/${version}/restore`, {}, { ifMatch: page.lockVersion ?? 0 }),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void qc.invalidateQueries({ queryKey: pageKeys.versions(page.id) })
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

export function useMovePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pageId, move }: { pageId: string; move: PageMove }) => api.post<PageDto>(`/pages/${pageId}/move`, move),
    onSuccess: (page) => void refreshPage(qc, page.id, page.spaceId),
  })
}

export function useCopyPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pageId: string) => api.post<PageDto>(`/pages/${pageId}/copy`),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

/** Archive, delete or restore a page with everything below it. */
export function useTrashAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pageId, action }: { pageId: string; action: 'archive' | 'delete' | 'restore' }) => api.post<PageDto>(`/pages/${pageId}/${action}`),
    onSuccess: (page) => {
      qc.setQueryData(pageKeys.page(page.id), page)
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

function useToggle(kind: 'star' | 'watch') {
  const qc = useQueryClient()
  const field = kind === 'star' ? 'starred' : 'watched'
  return useMutation({
    mutationFn: ({ page, on }: { page: Pick<Page, 'id' | 'spaceId'>; on: boolean }) => (on ? api.put(`/pages/${page.id}/${kind}`) : api.delete(`/pages/${page.id}/${kind}`)),
    onMutate: async ({ page, on }) => {
      await qc.cancelQueries({ queryKey: pageKeys.page(page.id), exact: true })
      const previous = qc.getQueryData<PageDto>(pageKeys.page(page.id))
      if (previous) qc.setQueryData(pageKeys.page(page.id), { ...previous, [field]: on })
      return { previous }
    },
    onError: (_err, { page }, ctx) => {
      if (ctx?.previous) qc.setQueryData(pageKeys.page(page.id), ctx.previous)
    },
    onSettled: (_r, _e, { page }) => {
      void qc.invalidateQueries({ queryKey: pageKeys.page(page.id) })
      void qc.invalidateQueries({ queryKey: ['home'] })
    },
  })
}

export const useTogglePageStar = () => useToggle('star')
export const useTogglePageWatch = () => useToggle('watch')

export function useSetRestrictions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ page, input }: { page: Pick<Page, 'id' | 'spaceId'>; input: PageRestrictionsInput }) =>
      api.put<PageRestrictionsDto>(`/pages/${page.id}/restrictions`, input),
    onSuccess: (restrictions, { page }) => {
      qc.setQueryData(pageKeys.restrictions(page.id), restrictions)
      void refreshPage(qc, page.id, page.spaceId)
    },
  })
}

export function useSetLabels() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ page, labels }: { page: Pick<Page, 'id' | 'spaceId'>; labels: string[] }) => api.put<string[]>(`/pages/${page.id}/labels`, { labels }),
    onSuccess: (_labels, { page }) => void refreshPage(qc, page.id, page.spaceId),
  })
}

/** Note that the person opened the page, for their recent list. Failures don't matter to them. */
export function recordView(pageId: string) {
  return api.post(`/pages/${pageId}/views`).catch(() => undefined)
}
