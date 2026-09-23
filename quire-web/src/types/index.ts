export type ThemePref = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'
export type ReadingFont = 'serif' | 'sans'
export type WidthMode = 'reading' | 'wide' | 'full'

export interface User {
  id: string
  name: string
  initials: string
  colorSeed: number
}

export interface Space {
  id: string
  key: string
  name: string
  icon: string
  description: string
  memberCount: number
  pageCount: number
  lastActivity: string
  starred: boolean
  archived: boolean
  ownerId: string
}

export type PageState =
  | 'draft'
  | 'published'
  | 'published-unpublished-changes'
  | 'restricted'
  | 'archived'

export interface PageTreeNode {
  id: string
  title: string
  icon?: string
  state: PageState
  restricted?: boolean
  children: PageTreeNode[]
}

export interface Comment {
  id: string
  authorId: string
  body: string
  relativeTime: string
  resolved?: boolean
  anchorText?: string
  replies?: Comment[]
}

export interface Label {
  name: string
}

export interface PageVersion {
  version: number
  authorId: string
  relativeTime: string
  comment: string
  current?: boolean
}

export interface Page {
  id: string
  spaceId: string
  parentId: string | null
  title: string
  icon?: string
  ownerId: string
  updatedById: string
  updatedRelative: string
  readTime: string
  state: PageState
  restricted: boolean
  labels: Label[]
  widthMode: WidthMode
  contentHtml: string
  comments: Comment[]
  versions: PageVersion[]
  wordCount: number
  isBlogPost?: boolean
  starred?: boolean
}
