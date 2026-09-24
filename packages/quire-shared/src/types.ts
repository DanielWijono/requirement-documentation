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
  watched?: boolean
  /** Principal id (user id or group id) → granted permissions. Missing means the defaults. */
  permissions?: Record<string, SpacePermission[]>
  /** What the signed-in person may do here (from the API), `Admin` expanded. */
  myPermissions?: SpacePermission[]
  /** From the API: when anything in the space last changed. */
  lastActivityAt?: string
}

export const SPACE_PERMISSIONS = ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin'] as const
export type SpacePermission = (typeof SPACE_PERMISSIONS)[number]

export type PageState =
  | 'draft'
  | 'published'
  | 'published-unpublished-changes'
  | 'restricted'
  | 'archived'
  | 'deleted'

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
  /** Snapshot of the page body at this version. Missing for legacy versions. */
  contentHtml?: string
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
  /** When restricted: the users allowed to view. Undefined means everyone in the space. */
  viewerIds?: string[]
  /** When restricted: the users allowed to edit. Undefined means everyone who can view. */
  editorIds?: string[]
  labels: Label[]
  widthMode: WidthMode
  /** Latest working copy: equals the published body unless there are unpublished changes. */
  contentHtml: string
  /** Body as of the last publish. Undefined for pages that were never published. */
  publishedHtml?: string
  comments: Comment[]
  versions: PageVersion[]
  wordCount: number
  isBlogPost?: boolean
  starred?: boolean
  watched?: boolean
  /** From the API: what the signed-in person may do with this page. */
  access?: { view: boolean; edit: boolean; comment: boolean; addChild: boolean; delete: boolean; restrict: boolean }
  /** From the API: the version to send in If-Match when publishing. */
  lockVersion?: number
  /** From the API: the draft revision to send in If-Match when saving; undefined without a draft. */
  draftRev?: number
  publishedVersion?: number
  /** From the API: ancestors, root first. */
  ancestors?: { id: string; title: string }[]
  createdAt?: string
}
