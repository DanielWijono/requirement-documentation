import { MEMBERS_GROUP_ID, type SiteRole } from './api.ts'
import { SPACE_PERMISSIONS, type SpacePermission } from './types.ts'

/**
 * The permission rule (§8.7, §8.8). Pure so the API and the web test fake enforce exactly the same thing;
 * the API loads the facts from the database and is the only authority.
 */

export type PrincipalType = 'user' | 'group'
export interface PrincipalRef {
  type: PrincipalType
  id: string
}

/** Who is asking: their id, site role and every group they belong to (the members group is added for them). */
export interface Subject {
  userId: string
  siteRole: SiteRole
  groupIds: readonly string[]
}

export interface SpaceGrant {
  principalType: PrincipalType
  principalId: string
  perms: readonly SpacePermission[]
}

export interface SpaceFacts {
  ownerId: string
  archived: boolean
  grants: readonly SpaceGrant[]
}

export type PageStatus = 'draft' | 'published' | 'archived' | 'deleted'

export interface PageFacts {
  ownerId: string
  status: PageStatus
  collaboratorIds: readonly string[]
  /** View lists of this page and each ancestor that has one. Every list must admit the subject. */
  viewLists: readonly (readonly PrincipalRef[])[]
  /** This page's own edit list; empty means no edit restriction. Not inherited. */
  editList: readonly PrincipalRef[]
}

export interface SpaceAccess {
  /** Effective permissions, with `Admin` expanded to everything. */
  perms: SpacePermission[]
  view: boolean
  /** Create a page at the top of the space. */
  addPage: boolean
  /** Change details, permissions, archive state, or delete the space. */
  admin: boolean
}

export interface PageAccess {
  view: boolean
  edit: boolean
  comment: boolean
  addChild: boolean
  /** Archive, delete and restore (the whole subtree). */
  delete: boolean
  /** Change this page's restrictions. */
  restrict: boolean
}

export const MEMBER_DEFAULT_PERMS: readonly SpacePermission[] = ['View', 'Add', 'Edit', 'Comment']
export const ALL_PERMS: readonly SpacePermission[] = SPACE_PERMISSIONS

/** The user plus their groups; the members group always counts. */
export function subjectOf(userId: string, siteRole: SiteRole, groupIds: readonly string[] = []): Subject {
  return { userId, siteRole, groupIds: groupIds.includes(MEMBERS_GROUP_ID) ? groupIds : [...groupIds, MEMBERS_GROUP_ID] }
}

export function isPrincipal(subject: Subject, p: PrincipalRef): boolean {
  return p.type === 'user' ? p.id === subject.userId : subject.groupIds.includes(p.id)
}

export function spacePermissions(subject: Subject, space: SpaceFacts): SpacePermission[] {
  if (subject.siteRole === 'admin' || space.ownerId === subject.userId) return [...ALL_PERMS]
  const granted = new Set<SpacePermission>()
  for (const g of space.grants) {
    if (isPrincipal(subject, { type: g.principalType, id: g.principalId })) for (const p of g.perms) granted.add(p)
  }
  if (granted.has('Admin')) return [...ALL_PERMS]
  return SPACE_PERMISSIONS.filter((p) => granted.has(p))
}

export function evaluateSpaceAccess(subject: Subject, space: SpaceFacts): SpaceAccess {
  const perms = spacePermissions(subject, space)
  const has = (p: SpacePermission) => perms.includes(p)
  const view = has('View')
  return { perms, view, addPage: view && has('Add') && !space.archived, admin: has('Admin') }
}

const NO_PAGE_ACCESS: PageAccess = { view: false, edit: false, comment: false, addChild: false, delete: false, restrict: false }

export function evaluatePageAccess(subject: Subject, space: SpaceFacts, page: PageFacts): PageAccess {
  const perms = spacePermissions(subject, space)
  const has = (p: SpacePermission) => perms.includes(p)
  if (!has('View')) return NO_PAGE_ACCESS

  const isOwner = page.ownerId === subject.userId
  if (page.status === 'draft' && !isOwner && !page.collaboratorIds.includes(subject.userId)) return NO_PAGE_ACCESS
  const trashed = page.status === 'archived' || page.status === 'deleted'
  if (trashed && !has('Admin') && !has('Delete')) return NO_PAGE_ACCESS
  if (!page.viewLists.every((list) => list.some((p) => isPrincipal(subject, p)))) return NO_PAGE_ACCESS

  // Trashed pages and pages in archived spaces are read-only until restored.
  const writable = !trashed && !space.archived
  const edit = writable && has('Edit') && (page.editList.length === 0 || page.editList.some((p) => isPrincipal(subject, p)))
  return {
    view: true,
    edit,
    comment: writable && has('Comment'),
    addChild: edit && has('Add'),
    delete: !space.archived && (has('Delete') || isOwner),
    restrict: edit,
  }
}
