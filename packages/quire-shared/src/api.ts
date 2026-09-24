import { z } from 'zod'
import { SPACE_PERMISSIONS, type SpacePermission } from './types.ts'

/** Every API error body: a stable machine code plus a message safe to show to people. */
export const apiErrorSchema = z.object({ code: z.string(), message: z.string(), current: z.unknown().optional() })
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const healthSchema = z.object({ ok: z.boolean(), db: z.enum(['up', 'down']) })
export type Health = z.infer<typeof healthSchema>

// ---------------------------------------------------------------------------
// People

export const SITE_ROLES = ['admin', 'member'] as const
export type SiteRole = (typeof SITE_ROLES)[number]
export const MIN_PASSWORD_LENGTH = 10
/** Every active user belongs to this group without a membership row. */
export const MEMBERS_GROUP_ID = 'group.members'

export interface UserDto {
  id: string
  name: string
  email: string
  initials: string
  colorSeed: number
  siteRole: SiteRole
  deactivated: boolean
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)
  return letters.toUpperCase()
}

const email = z.email().transform((v) => v.toLowerCase())
const displayName = z.string().trim().min(1).max(80)
const password = z.string().min(MIN_PASSWORD_LENGTH).max(200)

export const inviteCreateSchema = z.object({ email, siteRole: z.enum(SITE_ROLES).default('member') })
export type InviteCreate = z.input<typeof inviteCreateSchema>

export const inviteAcceptSchema = z.object({ name: displayName, password })
export type InviteAccept = z.infer<typeof inviteAcceptSchema>

export interface InviteDto {
  id: string
  email: string
  siteRole: SiteRole
  invitedBy: string
  expiresAt: string
}

/** What the accept-invite screen shows before the person picks a name and password. */
export interface InviteLookupDto {
  email: string
  inviterName: string
  expiresAt: string
}

export const userUpdateSchema = z
  .object({ siteRole: z.enum(SITE_ROLES).optional(), deactivated: z.boolean().optional() })
  .refine((v) => v.siteRole !== undefined || v.deactivated !== undefined, 'Nothing to update')
export type UserUpdate = z.infer<typeof userUpdateSchema>

const groupDescription = z.string().trim().max(500)
export const groupInputSchema = z.object({ name: displayName, description: groupDescription.default('') })
export type GroupInput = z.input<typeof groupInputSchema>
/** A partial update: fields left out stay as they are. */
export const groupPatchSchema = z.object({ name: displayName.optional(), description: groupDescription.optional() })
export type GroupPatch = z.infer<typeof groupPatchSchema>

export const groupMembersSchema = z.object({ userIds: z.array(z.string().min(1)).max(1000) })

export interface GroupDto {
  id: string
  name: string
  description: string
  isSystem: boolean
  memberCount: number
}

export interface GroupDetailDto extends GroupDto {
  members: UserDto[]
}

// ---------------------------------------------------------------------------
// Spaces

export const SPACE_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/
const spaceKey = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(SPACE_KEY_PATTERN, 'Use 2–10 letters or digits, starting with a letter'))
const spaceName = z.string().trim().min(1).max(100)
const spaceDescription = z.string().trim().max(1000)
const spaceIcon = z.string().trim().min(1).max(16)

export const spaceCreateSchema = z.object({
  key: spaceKey,
  name: spaceName,
  description: spaceDescription.default(''),
  icon: spaceIcon.default('📁'),
})
export type SpaceCreate = z.input<typeof spaceCreateSchema>

export const spacePatchSchema = z
  .object({ name: spaceName.optional(), description: spaceDescription.optional(), icon: spaceIcon.optional() })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.icon !== undefined, 'Nothing to update')
export type SpacePatch = z.infer<typeof spacePatchSchema>

export const spaceGrantSchema = z.object({
  principalType: z.enum(['user', 'group']),
  principalId: z.string().min(1),
  perms: z.array(z.enum(SPACE_PERMISSIONS)).max(SPACE_PERMISSIONS.length),
})
export const spacePermissionsSchema = z.object({ grants: z.array(spaceGrantSchema).max(500) })
export type SpacePermissionsInput = z.infer<typeof spacePermissionsSchema>

export interface SpaceDto {
  id: string
  key: string
  name: string
  icon: string
  description: string
  ownerId: string
  archived: boolean
  lastActivityAt: string
  pageCount: number
  /** Active people who can view the space. */
  memberCount: number
  starred: boolean
  watched: boolean
  /** What the signed-in person may do here, `Admin` expanded. */
  myPermissions: SpacePermission[]
}

export interface SpaceGrantDto {
  principalType: 'user' | 'group'
  principalId: string
  /** The person's or group's display name. */
  name: string
  perms: SpacePermission[]
}

// ---------------------------------------------------------------------------
// Pages

export const WIDTH_MODES = ['reading', 'wide', 'full'] as const
export type PageStatusDto = 'draft' | 'published' | 'archived' | 'deleted'

const pageTitle = z.string().trim().min(1).max(255)
const pageIcon = z.string().trim().min(1).max(16).nullable()
/** Page bodies are HTML from the editor; the API sanitizes them before storing. */
const pageHtml = z.string().max(2_000_000)
const principalRef = z.object({ type: z.enum(['user', 'group']), id: z.string().min(1) })

export const pageCreateSchema = z.object({
  spaceKey: z.string().min(1),
  parentId: z.string().min(1).nullable().default(null),
  title: pageTitle.default('Untitled'),
  icon: pageIcon.default(null),
  html: pageHtml.default('<p></p>'),
  isBlogPost: z.boolean().default(false),
})
export type PageCreate = z.input<typeof pageCreateSchema>

export const pagePatchSchema = z
  .object({ title: pageTitle.optional(), icon: pageIcon.optional(), widthMode: z.enum(WIDTH_MODES).optional() })
  .refine((v) => v.title !== undefined || v.icon !== undefined || v.widthMode !== undefined, 'Nothing to update')
export type PagePatch = z.infer<typeof pagePatchSchema>

export const draftSaveSchema = z.object({ html: pageHtml })
export const publishSchema = z.object({ comment: z.string().trim().max(500).default('') })
export type PublishInput = z.input<typeof publishSchema>

/** `index` is the position among the new siblings (0 = first); past the end means last. */
export const pageMoveSchema = z.object({ parentId: z.string().min(1).nullable(), index: z.number().int().min(0).default(Number.MAX_SAFE_INTEGER) })
export type PageMove = z.input<typeof pageMoveSchema>

export const pageCopySchema = z.object({ title: pageTitle.optional() })
export const pageRestrictionsSchema = z.object({ view: z.array(principalRef).max(500), edit: z.array(principalRef).max(500) })
export type PageRestrictionsInput = z.infer<typeof pageRestrictionsSchema>
export const collaboratorsSchema = z.object({ userIds: z.array(z.string().min(1)).max(100) })

export interface PageAccessDto {
  view: boolean
  edit: boolean
  comment: boolean
  addChild: boolean
  delete: boolean
  restrict: boolean
}

/** One row of the page tree: a single level, loaded lazily. */
export interface PageNodeDto {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  status: PageStatusDto
  /** Published with unpublished changes in a draft. */
  hasDraft: boolean
  /** Has its own view or edit restriction. */
  restricted: boolean
  hasChildren: boolean
}

export interface DraftDto {
  html: string
  rev: number
  updatedAt: string
  updatedById: string
}

export interface PageDto {
  id: string
  spaceId: string
  spaceKey: string
  parentId: string | null
  ancestors: { id: string; title: string }[]
  title: string
  icon: string | null
  status: PageStatusDto
  ownerId: string
  updatedById: string
  createdAt: string
  updatedAt: string
  /** Null until the first publish. */
  publishedHtml: string | null
  publishedVersion: number
  /** Send back in If-Match when publishing or restoring a version. */
  lockVersion: number
  wordCount: number
  widthMode: (typeof WIDTH_MODES)[number]
  isBlogPost: boolean
  labels: string[]
  restricted: boolean
  starred: boolean
  watched: boolean
  /** Only for people who can edit. */
  draft: DraftDto | null
  myAccess: PageAccessDto
}

export interface PageVersionDto {
  version: number
  title: string
  authorId: string
  comment: string
  createdAt: string
}

export interface PageVersionDetailDto extends PageVersionDto {
  html: string | null
}

export interface PrincipalDto {
  type: 'user' | 'group'
  id: string
  name: string
}

export interface PageRestrictionsDto {
  view: PrincipalDto[]
  edit: PrincipalDto[]
  /** View lists on ancestors, nearest first. Shown read-only; they also limit this page. */
  inherited: { pageId: string; title: string; view: PrincipalDto[] }[]
}

// ---------------------------------------------------------------------------
// Comments, labels and home

const commentBody = z.string().trim().min(1).max(10_000)
export const commentCreateSchema = z.object({ body: commentBody, anchorText: z.string().trim().min(1).max(500).nullable().default(null) })
export type CommentCreate = z.input<typeof commentCreateSchema>
export const commentBodySchema = z.object({ body: commentBody })

export const LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/
const labelName = z
  .string()
  .trim()
  .transform((v) => v.toLowerCase().replace(/\s+/g, '-'))
  .pipe(z.string().regex(LABEL_PATTERN, 'Labels use letters, digits, - and _ (up to 50)'))
export const labelsSchema = z.object({ labels: z.array(labelName).max(20) })

export interface CommentDto {
  id: string
  pageId: string
  parentId: string | null
  authorId: string
  /** Empty for a deleted comment kept only because it has replies. */
  body: string
  anchorText: string | null
  resolved: boolean
  edited: boolean
  deleted: boolean
  createdAt: string
  updatedAt: string
  replies: CommentDto[]
}

export interface LabelCountDto {
  name: string
  /** Pages the person can see that carry the label. */
  count: number
}

/** A page in a home list (recent, starred, drafts). */
export interface PageItemDto {
  id: string
  title: string
  icon: string | null
  status: PageStatusDto
  hasDraft: boolean
  spaceKey: string
  spaceName: string
  updatedAt: string
  updatedById: string
  /** When the person last opened it (recent list only). */
  viewedAt: string | null
}

export interface StarredDto {
  spaces: SpaceDto[]
  pages: PageItemDto[]
}

// ---------------------------------------------------------------------------
// Search

export const SEARCH_MODIFIED = { today: 1, week: 7, month: 30 } as const
const optionalParam = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  space: optionalParam,
  type: z.enum(['page', 'blog']).optional(),
  contributor: optionalParam,
  modified: z.enum(['today', 'week', 'month']).optional(),
  label: optionalParam,
  sort: z.enum(['relevance', 'modified']).default('relevance'),
  cursor: optionalParam,
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type SearchQuery = z.input<typeof searchQuerySchema>
export const SEARCH_FILTERS = ['space', 'type', 'contributor', 'modified', 'label'] as const
export type SearchFilter = (typeof SEARCH_FILTERS)[number]

/** A run of snippet text; `match` marks the words that matched the query. Plain text, never HTML. */
export interface SnippetPart {
  text: string
  match: boolean
}

export interface SearchResultDto {
  id: string
  title: string
  icon: string | null
  spaceKey: string
  spaceName: string
  isBlogPost: boolean
  ownerId: string
  updatedById: string
  updatedAt: string
  labels: string[]
  snippet: SnippetPart[]
}

export interface SearchResponseDto {
  results: SearchResultDto[]
  total: number
  nextCursor: string | null
  /** For each active filter, how many results there would be without it. */
  relaxed: Partial<Record<SearchFilter, number>>
}

/** The command palette: quick title matches. */
export interface QuickSearchDto {
  pages: { id: string; title: string; icon: string | null; spaceKey: string; spaceName: string }[]
  spaces: { key: string; name: string; icon: string }[]
}

/** Split `ts_headline` output that uses \u0001 / \u0002 as start and stop markers. */
export const SNIPPET_START = '\u0001'
export const SNIPPET_STOP = '\u0002'

export function parseSnippet(marked: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let text = ''
  let match = false
  const flush = () => {
    if (text) parts.push({ text, match })
    text = ''
  }
  for (const ch of marked) {
    if (ch === SNIPPET_START || ch === SNIPPET_STOP) {
      flush()
      match = ch === SNIPPET_START
    } else text += ch
  }
  flush()
  return parts
}
