import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Comment, Page, PageState, PageTreeNode, Space } from '../types'
import { currentUser, pageTree as pageTreeSeed, pages as pagesSeed, recentlyViewedSeed, spaces as spacesSeed } from '../data/mockData'

interface RecentEntry {
  pageId: string
  spaceId: string
  relativeTime: string
}

interface ContentState {
  spaces: Space[]
  pages: Record<string, Page>
  pageTree: Record<string, PageTreeNode[]>
  recentlyViewed: RecentEntry[]

  togglePageStar: (pageId: string) => void
  recordView: (pageId: string, spaceId: string) => void
  createPage: (spaceId: string, parentId: string | null, title?: string, contentHtml?: string) => string
  saveContent: (pageId: string, html: string, opts: { publish: boolean; comment?: string }) => void
  discardChanges: (pageId: string) => void
  updatePageMeta: (pageId: string, patch: Partial<Page>) => void
  addComment: (pageId: string, body: string, anchorText?: string) => void
  addReply: (pageId: string, commentId: string, body: string) => void
  toggleResolveComment: (pageId: string, commentId: string) => void
  restoreVersion: (pageId: string, version: number) => void
  movePage: (pageId: string, newParentId: string | null) => boolean
  copyPage: (pageId: string) => string | null
  archivePage: (pageId: string) => void
  restorePage: (pageId: string) => void
  deletePage: (pageId: string) => void
  resetToSeed: () => void
  /** Drop a deleted space's pages from the local store (the space itself lives in the API). */
  deleteSpace: (spaceId: string) => void
}

type ContentData = Pick<ContentState, 'spaces' | 'pages' | 'pageTree' | 'recentlyViewed'>

export const CONTENT_STORAGE_KEY = 'quire.content'
/** Bump when the persisted shape changes, and add a step to `migrateContent`. */
export const CONTENT_SCHEMA_VERSION = 1

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Fill in fields older seed data lacks: the published body and a snapshot on the current version. */
function normalizePages(pages: Record<string, Page>): Record<string, Page> {
  return Object.fromEntries(
    Object.entries(pages).map(([id, p]) => {
      const publishedHtml = p.publishedHtml ?? (p.state === 'draft' ? undefined : p.contentHtml)
      const versions = p.versions.map((v) => (v.current && v.contentHtml === undefined ? { ...v, contentHtml: publishedHtml } : v))
      return [id, { ...p, publishedHtml, versions }]
    }),
  )
}

function insertNode(nodes: PageTreeNode[], parentId: string | null, node: PageTreeNode): PageTreeNode[] {
  if (parentId === null) return [...nodes, node]
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, node] }
    if (n.children.length) return { ...n, children: insertNode(n.children, parentId, node) }
    return n
  })
}

function removeNode(nodes: PageTreeNode[], id: string): PageTreeNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children.length ? { ...n, children: removeNode(n.children, id) } : n))
}

function patchNodeState(nodes: PageTreeNode[], id: string, state: PageState): PageTreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, state }
    if (n.children.length) return { ...n, children: patchNodeState(n.children, id, state) }
    return n
  })
}

function patchNode(nodes: PageTreeNode[], id: string, patch: Partial<PageTreeNode>): PageTreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch }
    if (n.children.length) return { ...n, children: patchNode(n.children, id, patch) }
    return n
  })
}

function collectIds(node: PageTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)]
}

let nextId = 1000

function seedData(): ContentData {
  return {
    spaces: cloneSeed(spacesSeed),
    pages: normalizePages(cloneSeed(pagesSeed)),
    pageTree: cloneSeed(pageTreeSeed),
    recentlyViewed: cloneSeed(recentlyViewedSeed),
  }
}

/** Keep generated ids unique after loading saved data: move the counter past every numeric suffix in use. */
function bumpIdCounter(data: Pick<ContentData, 'spaces' | 'pages'>) {
  const ids = [
    ...data.spaces.map((s) => s.id),
    ...Object.values(data.pages).flatMap((p) => [p.id, ...p.comments.flatMap((c) => [c.id, ...(c.replies ?? []).map((r) => r.id)])]),
  ]
  for (const id of ids) {
    const n = Number(/-(\d+)$/.exec(id)?.[1])
    if (Number.isFinite(n) && n >= nextId) nextId = n + 1
  }
}

/** Upgrade persisted data from older schema versions. */
export function migrateContent(persisted: unknown, version: number): ContentData {
  const data = persisted as ContentData
  if (version < 1) {
    // v0 had no published body or version snapshots.
    return { ...data, pages: normalizePages(data.pages) }
  }
  return data
}

export const useContentStore = create<ContentState>()(
  persist(
    (set, get) => ({
  ...seedData(),

  resetToSeed: () => set(seedData()),

  deleteSpace: (spaceId) =>
    set((s) => {
      const pageTree = { ...s.pageTree }
      delete pageTree[spaceId]
      return {
        spaces: s.spaces.filter((sp) => sp.id !== spaceId),
        pages: Object.fromEntries(Object.entries(s.pages).filter(([, p]) => p.spaceId !== spaceId)),
        pageTree,
        recentlyViewed: s.recentlyViewed.filter((r) => r.spaceId !== spaceId),
      }
    }),

  togglePageStar: (pageId) =>
    set((s) => ({
      pages: { ...s.pages, [pageId]: { ...s.pages[pageId], starred: !s.pages[pageId].starred } },
    })),

  recordView: (pageId, spaceId) =>
    set((s) => ({
      recentlyViewed: [
        { pageId, spaceId, relativeTime: 'Just now' },
        ...s.recentlyViewed.filter((r) => r.pageId !== pageId),
      ].slice(0, 8),
    })),

  createPage: (spaceId, parentId, title = 'Untitled', contentHtml = '<p></p>') => {
    const id = `pg.new-${nextId++}`
    const page: Page = {
      id,
      spaceId,
      parentId,
      title,
      ownerId: currentUser.id,
      updatedById: currentUser.id,
      updatedRelative: 'Just now',
      readTime: '< 1 min read',
      state: 'draft',
      restricted: false,
      labels: [],
      widthMode: 'reading',
      wordCount: 0,
      comments: [],
      versions: [],
      contentHtml,
    }
    const node: PageTreeNode = { id, title, state: 'draft', children: [] }
    set((s) => ({
      pages: { ...s.pages, [id]: page },
      pageTree: {
        ...s.pageTree,
        [spaceId]: insertNode(s.pageTree[spaceId] ?? [], parentId, node),
      },
    }))
    return id
  },

  saveContent: (pageId, html, { publish, comment }) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      const wasPublished = page.publishedHtml !== undefined
      const nextState: PageState = publish
        ? 'published'
        : !wasPublished
          ? 'draft'
          : html === page.publishedHtml
            ? 'published'
            : 'published-unpublished-changes'
      const nextVersions = publish
        ? [
            {
              version: (page.versions[0]?.version ?? 0) + 1,
              authorId: currentUser.id,
              relativeTime: 'Just now',
              comment: comment || 'Published',
              current: true,
              contentHtml: html,
            },
            ...page.versions.map((v) => ({ ...v, current: false })),
          ]
        : page.versions
      const updated: Page = {
        ...page,
        contentHtml: html,
        publishedHtml: publish ? html : page.publishedHtml,
        updatedById: currentUser.id,
        updatedRelative: 'Just now',
        state: nextState,
        versions: nextVersions,
      }
      return {
        pages: { ...s.pages, [pageId]: updated },
        // Autosave runs every few hundred ms; only touch the tree when the visible state changes.
        pageTree:
          nextState === page.state
            ? s.pageTree
            : { ...s.pageTree, [page.spaceId]: patchNodeState(s.pageTree[page.spaceId] ?? [], pageId, nextState) },
      }
    }),

  discardChanges: (pageId) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page || page.publishedHtml === undefined) return s
      return {
        pages: { ...s.pages, [pageId]: { ...page, contentHtml: page.publishedHtml, state: 'published' } },
        pageTree: { ...s.pageTree, [page.spaceId]: patchNodeState(s.pageTree[page.spaceId] ?? [], pageId, 'published') },
      }
    }),

  updatePageMeta: (pageId, patch) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      // Keep the fields the tree mirrors in sync.
      const nodePatch: Partial<PageTreeNode> = {}
      if (patch.title !== undefined && patch.title !== page.title) nodePatch.title = patch.title
      if (patch.restricted !== undefined && patch.restricted !== page.restricted) nodePatch.restricted = patch.restricted
      return {
        pages: { ...s.pages, [pageId]: { ...page, ...patch } },
        pageTree: Object.keys(nodePatch).length
          ? { ...s.pageTree, [page.spaceId]: patchNode(s.pageTree[page.spaceId] ?? [], pageId, nodePatch) }
          : s.pageTree,
      }
    }),

  addComment: (pageId, body, anchorText) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      const comment: Comment = {
        id: `c-${nextId++}`,
        authorId: currentUser.id,
        body,
        relativeTime: 'Just now',
        anchorText,
      }
      return { pages: { ...s.pages, [pageId]: { ...page, comments: [comment, ...page.comments] } } }
    }),

  addReply: (pageId, commentId, body) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      const reply: Comment = { id: `c-${nextId++}`, authorId: currentUser.id, body, relativeTime: 'Just now' }
      return {
        pages: {
          ...s.pages,
          [pageId]: {
            ...page,
            comments: page.comments.map((c) => (c.id === commentId ? { ...c, replies: [...(c.replies ?? []), reply] } : c)),
          },
        },
      }
    }),

  toggleResolveComment: (pageId, commentId) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      return {
        pages: {
          ...s.pages,
          [pageId]: {
            ...page,
            comments: page.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
          },
        },
      }
    }),

  restoreVersion: (pageId, version) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      const target = page.versions.find((v) => v.version === version)
      if (!target || target.contentHtml === undefined) return s
      const html = target.contentHtml
      const newVersion = {
        version: (page.versions[0]?.version ?? 0) + 1,
        authorId: currentUser.id,
        relativeTime: 'Just now',
        comment: `Restored version ${version}`,
        current: true,
        contentHtml: html,
      }
      return {
        pages: {
          ...s.pages,
          [pageId]: {
            ...page,
            contentHtml: html,
            publishedHtml: html,
            state: 'published',
            updatedById: currentUser.id,
            updatedRelative: 'Just now',
            versions: [newVersion, ...page.versions.map((v) => ({ ...v, current: false }))],
          },
        },
        pageTree: { ...s.pageTree, [page.spaceId]: patchNodeState(s.pageTree[page.spaceId] ?? [], pageId, 'published') },
      }
    }),

  movePage: (pageId, newParentId) => {
    const { pages, pageTree } = get()
    const page = pages[pageId]
    if (!page || page.parentId === newParentId) return false
    const tree = pageTree[page.spaceId] ?? []
    const node = findTreeNodeIn(tree, pageId)
    if (!node) return false
    // A page cannot move under itself or one of its descendants.
    if (newParentId !== null && collectIds(node).includes(newParentId)) return false
    set((s) => ({
      pages: { ...s.pages, [pageId]: { ...page, parentId: newParentId } },
      pageTree: { ...s.pageTree, [page.spaceId]: insertNode(removeNode(tree, pageId), newParentId, node) },
    }))
    return true
  },

  copyPage: (pageId) => {
    const page = get().pages[pageId]
    if (!page) return null
    return get().createPage(page.spaceId, page.parentId, `Copy of ${page.title}`, page.contentHtml)
  },

  archivePage: (pageId) => setSubtreeState(pageId, 'archived'),

  deletePage: (pageId) => setSubtreeState(pageId, 'deleted'),

  restorePage: (pageId) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page || (page.state !== 'archived' && page.state !== 'deleted')) return s
      const tree = s.pageTree[page.spaceId] ?? []
      const parent = page.parentId ? s.pages[page.parentId] : undefined
      const parentVisible = parent && findTreeNodeIn(tree, parent.id)
      const parentId = parentVisible ? page.parentId : null
      const state: PageState = page.publishedHtml === undefined ? 'draft' : 'published'
      const node: PageTreeNode = { id: page.id, title: page.title, icon: page.icon, state, restricted: page.restricted, children: [] }
      return {
        pages: { ...s.pages, [pageId]: { ...page, state, parentId } },
        pageTree: { ...s.pageTree, [page.spaceId]: insertNode(tree, parentId, node) },
      }
    }),
    }),
    {
      name: CONTENT_STORAGE_KEY,
      version: CONTENT_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ContentData => ({ spaces: s.spaces, pages: s.pages, pageTree: s.pageTree, recentlyViewed: s.recentlyViewed }),
      migrate: migrateContent,
      onRehydrateStorage: () => (state) => {
        if (state) bumpIdCounter(state)
      },
    },
  ),
)

/** Archive or delete a page together with everything below it, and drop the subtree from the nav. */
function setSubtreeState(pageId: string, state: 'archived' | 'deleted') {
  useContentStore.setState((s) => {
    const page = s.pages[pageId]
    if (!page) return s
    const tree = s.pageTree[page.spaceId] ?? []
    const node = findTreeNodeIn(tree, pageId)
    const ids = node ? collectIds(node) : [pageId]
    const pages = { ...s.pages }
    for (const id of ids) if (pages[id]) pages[id] = { ...pages[id], state }
    return { pages, pageTree: { ...s.pageTree, [page.spaceId]: removeNode(tree, pageId) } }
  })
}

/** Restricted pages are only viewable by the listed users. */
export function canView(page: Page): boolean {
  return !page.restricted || !page.viewerIds || page.viewerIds.includes(currentUser.id)
}

/** Editing needs view access, plus a place in the editor list when one is set. */
export function canEdit(page: Page): boolean {
  return canView(page) && (!page.restricted || !page.editorIds || page.editorIds.includes(currentUser.id))
}

/** Pages that belong in lists, search and navigation menus: not archived, not deleted, and viewable. */
export function isVisiblePage(page: Page | undefined): page is Page {
  return !!page && page.state !== 'archived' && page.state !== 'deleted' && canView(page)
}

/**
 * Subscribe to a small piece of derived data (plain JSON) without re-rendering when unrelated
 * content changes: the selector's result is compared by value, not by reference.
 */
export function useDerived<T>(selector: (s: ContentState) => T): T {
  const json = useContentStore((s) => JSON.stringify(selector(s)))
  return useMemo(() => JSON.parse(json) as T, [json])
}

export function usePage(pageId: string | undefined) {
  return useContentStore((s) => (pageId ? s.pages[pageId] : undefined))
}

// Selectors must return a stable reference; a fresh [] per call makes zustand re-render forever.
const EMPTY_TREE: PageTreeNode[] = []

export function usePageTree(spaceId: string | undefined) {
  return useContentStore((s) => (spaceId ? s.pageTree[spaceId] ?? EMPTY_TREE : EMPTY_TREE))
}

export function findTreeNodeIn(nodes: PageTreeNode[], pageId: string): PageTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === pageId) return n
    const found = findTreeNodeIn(n.children, pageId)
    if (found) return found
  }
  return undefined
}

export function ancestorChainIn(nodes: PageTreeNode[], pageId: string): PageTreeNode[] {
  const chain: PageTreeNode[] = []
  function walk(list: PageTreeNode[], trail: PageTreeNode[]): boolean {
    for (const n of list) {
      const nextTrail = [...trail, n]
      if (n.id === pageId) {
        chain.push(...nextTrail)
        return true
      }
      if (walk(n.children, nextTrail)) return true
    }
    return false
  }
  walk(nodes, [])
  return chain
}

export function getState() {
  return useContentStore.getState()
}
