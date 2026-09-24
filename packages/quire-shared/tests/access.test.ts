import { describe, expect, it } from 'vitest'
import {
  evaluatePageAccess,
  evaluateSpaceAccess,
  MEMBER_DEFAULT_PERMS,
  spacePermissions,
  subjectOf,
  type PageAccess,
  type PageFacts,
  type SpaceFacts,
  type Subject,
} from '../src/access.ts'
import { MEMBERS_GROUP_ID } from '../src/api.ts'

const owner = subjectOf('u.owner', 'member')
const siteAdmin = subjectOf('u.admin', 'admin')
const member = subjectOf('u.member', 'member')
const designer = subjectOf('u.designer', 'member', ['g.design'])
const spaceAdmin = subjectOf('u.spaceadmin', 'member')
const deleter = subjectOf('u.deleter', 'member')
const collaborator = subjectOf('u.collab', 'member')

const space: SpaceFacts = {
  ownerId: 'u.owner',
  archived: false,
  grants: [
    { principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: MEMBER_DEFAULT_PERMS },
    { principalType: 'group', principalId: 'g.design', perms: ['View', 'Comment'] },
    { principalType: 'user', principalId: 'u.spaceadmin', perms: ['Admin'] },
    { principalType: 'user', principalId: 'u.deleter', perms: ['View', 'Delete'] },
  ],
}
const closedSpace: SpaceFacts = { ...space, grants: space.grants.filter((g) => g.principalId !== MEMBERS_GROUP_ID) }

const page = (over: Partial<PageFacts> = {}): PageFacts => ({
  ownerId: 'u.owner',
  status: 'published',
  collaboratorIds: [],
  viewLists: [],
  editList: [],
  ...over,
})

const NONE: PageAccess = { view: false, edit: false, comment: false, addChild: false, delete: false, restrict: false }
const READ: PageAccess = { ...NONE, view: true }
const FULL: PageAccess = { view: true, edit: true, comment: true, addChild: true, delete: true, restrict: true }
const MEMBER: PageAccess = { ...FULL, delete: false }

describe('subjectOf', () => {
  it('always includes the members group, once', () => {
    expect(subjectOf('u', 'member').groupIds).toEqual([MEMBERS_GROUP_ID])
    expect(subjectOf('u', 'member', ['g.x', MEMBERS_GROUP_ID]).groupIds).toEqual(['g.x', MEMBERS_GROUP_ID])
  })
})

describe('space permissions', () => {
  const cases: [string, Subject, SpaceFacts, string[]][] = [
    ['site admin gets everything', siteAdmin, closedSpace, ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin']],
    ['owner gets everything', owner, closedSpace, ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin']],
    ['Admin implies the rest', spaceAdmin, space, ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin']],
    ['members group defaults', member, space, ['View', 'Add', 'Edit', 'Comment']],
    ['union of user and group rows', deleter, space, ['View', 'Add', 'Edit', 'Delete', 'Comment']],
    ['union of several groups', designer, space, ['View', 'Add', 'Edit', 'Comment']],
    ['a group row alone', designer, closedSpace, ['View', 'Comment']],
    ['nothing without a row', member, closedSpace, []],
  ]
  it.each(cases)('%s', (_, subject, facts, expected) => {
    expect(spacePermissions(subject, facts)).toEqual(expected)
  })

  it('summarizes space access, read-only when archived', () => {
    expect(evaluateSpaceAccess(member, space)).toMatchObject({ view: true, addPage: true, admin: false })
    expect(evaluateSpaceAccess(member, closedSpace)).toMatchObject({ view: false, addPage: false, admin: false })
    expect(evaluateSpaceAccess(spaceAdmin, { ...space, archived: true })).toMatchObject({ view: true, addPage: false, admin: true })
  })
})

describe('page access', () => {
  const byDesign = { type: 'group' as const, id: 'g.design' }
  const byMember = { type: 'user' as const, id: 'u.member' }
  const cases: [string, Subject, SpaceFacts, PageFacts, PageAccess][] = [
    ['member on an open page', member, space, page(), MEMBER],
    ['owner may delete their page', owner, space, page(), FULL],
    ['page owner without space Delete may still delete', member, space, page({ ownerId: 'u.member' }), FULL],
    ['space View only', designer, { ...closedSpace, grants: [{ principalType: 'group', principalId: 'g.design', perms: ['View'] }] }, page(), READ],
    ['View and Comment', designer, closedSpace, page(), { ...READ, comment: true }],
    ['no space View hides everything', member, closedSpace, page(), NONE],
    ['draft hidden from others', member, space, page({ status: 'draft' }), NONE],
    ['draft hidden even from site admins', siteAdmin, space, page({ status: 'draft' }), NONE],
    ['draft visible to its author', owner, space, page({ status: 'draft' }), FULL],
    ['draft visible to collaborators', collaborator, space, page({ status: 'draft', collaboratorIds: ['u.collab'] }), MEMBER],
    ['archived hidden without Delete', member, space, page({ status: 'archived' }), NONE],
    ['archived is read-only for Delete holders', deleter, space, page({ status: 'archived' }), { ...READ, delete: true }],
    ['deleted is read-only for space admins', spaceAdmin, space, page({ status: 'deleted' }), { ...READ, delete: true }],
    ['the page owner sees their own trashed page', member, space, page({ status: 'archived', ownerId: 'u.member' }), { ...READ, delete: true }],
    ['own view list admits', member, space, page({ viewLists: [[byMember]] }), MEMBER],
    ['own view list excludes', designer, space, page({ viewLists: [[byMember]] }), NONE],
    ['group on the view list', designer, space, page({ viewLists: [[byDesign]] }), MEMBER],
    ['every inherited view list must admit', member, space, page({ viewLists: [[byMember], [byDesign]] }), NONE],
    ['view lists bind site admins too', siteAdmin, space, page({ viewLists: [[byMember]] }), NONE],
    ['edit list excludes: read and comment only', designer, space, page({ editList: [byMember] }), { ...READ, comment: true }],
    ['edit list admits', member, space, page({ editList: [byMember] }), MEMBER],
    ['archived space is read-only', spaceAdmin, { ...space, archived: true }, page(), READ],
  ]
  it.each(cases)('%s', (_, subject, facts, p, expected) => {
    expect(evaluatePageAccess(subject, facts, p)).toEqual(expected)
  })
})
