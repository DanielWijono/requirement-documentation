import { create } from 'zustand'
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

  toggleSpaceStar: (spaceId: string) => void
  togglePageStar: (pageId: string) => void
  recordView: (pageId: string, spaceId: string) => void
  createPage: (spaceId: string, parentId: string | null, title?: string) => string
  createSpace: (input: { name: string; key: string; description: string; icon: string }) => string
  saveContent: (pageId: string, html: string, opts: { publish: boolean; comment?: string }) => void
  updatePageMeta: (pageId: string, patch: Partial<Page>) => void
  addComment: (pageId: string, body: string, anchorText?: string) => void
  toggleResolveComment: (pageId: string, commentId: string) => void
  restoreVersion: (pageId: string, version: number) => void
  archivePage: (pageId: string) => void
}

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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

let nextId = 1000

export const useContentStore = create<ContentState>((set) => ({
  spaces: cloneSeed(spacesSeed),
  pages: cloneSeed(pagesSeed),
  pageTree: cloneSeed(pageTreeSeed),
  recentlyViewed: cloneSeed(recentlyViewedSeed),

  toggleSpaceStar: (spaceId) =>
    set((s) => ({
      spaces: s.spaces.map((sp) => (sp.id === spaceId ? { ...sp, starred: !sp.starred } : sp)),
    })),

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

  createPage: (spaceId, parentId, title = 'Untitled') => {
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
      contentHtml: '<p></p>',
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

  createSpace: ({ name, key, description, icon }) => {
    const id = `sp.new-${nextId++}`
    const space: Space = {
      id,
      key: key.toUpperCase(),
      name,
      icon: icon || '\u{1F4C1}',
      description,
      memberCount: 1,
      pageCount: 0,
      lastActivity: 'Just now',
      starred: false,
      archived: false,
      ownerId: currentUser.id,
    }
    set((s) => ({ spaces: [...s.spaces, space], pageTree: { ...s.pageTree, [id]: [] } }))
    return id
  },

  saveContent: (pageId, html, { publish, comment }) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      const wasPublished = page.state !== 'draft'
      const nextState: PageState = publish ? 'published' : wasPublished ? 'published-unpublished-changes' : 'draft'
      const nextVersions = publish
        ? [
            { version: (page.versions[0]?.version ?? 0) + 1, authorId: currentUser.id, relativeTime: 'Just now', comment: comment || 'Published', current: true },
            ...page.versions.map((v) => ({ ...v, current: false })),
          ]
        : page.versions
      const updated: Page = {
        ...page,
        contentHtml: html,
        updatedById: currentUser.id,
        updatedRelative: 'Just now',
        state: nextState,
        versions: nextVersions,
      }
      return {
        pages: { ...s.pages, [pageId]: updated },
        pageTree: { ...s.pageTree, [page.spaceId]: patchNodeState(s.pageTree[page.spaceId] ?? [], pageId, nextState) },
      }
    }),

  updatePageMeta: (pageId, patch) =>
    set((s) => ({ pages: { ...s.pages, [pageId]: { ...s.pages[pageId], ...patch } } })),

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
      if (!target) return s
      const newVersion = {
        version: (page.versions[0]?.version ?? 0) + 1,
        authorId: currentUser.id,
        relativeTime: 'Just now',
        comment: `Restored version ${version}`,
        current: true,
      }
      return {
        pages: {
          ...s.pages,
          [pageId]: {
            ...page,
            versions: [newVersion, ...page.versions.map((v) => ({ ...v, current: false }))],
          },
        },
      }
    }),

  archivePage: (pageId) =>
    set((s) => {
      const page = s.pages[pageId]
      if (!page) return s
      return {
        pages: { ...s.pages, [pageId]: { ...page, state: 'archived' } },
        pageTree: { ...s.pageTree, [page.spaceId]: removeNode(s.pageTree[page.spaceId] ?? [], pageId) },
      }
    }),
}))

export function useSpace(spaceId: string | undefined) {
  return useContentStore((s) => s.spaces.find((sp) => sp.id === spaceId))
}

export function usePage(pageId: string | undefined) {
  return useContentStore((s) => (pageId ? s.pages[pageId] : undefined))
}

export function usePageTree(spaceId: string | undefined) {
  return useContentStore((s) => (spaceId ? s.pageTree[spaceId] ?? [] : []))
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
