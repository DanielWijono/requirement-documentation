import { describe, expect, it } from 'vitest'
import {
  commentCreateSchema,
  groupInputSchema,
  labelsSchema,
  initialsOf,
  inviteCreateSchema,
  pageCreateSchema,
  pageMoveSchema,
  pagePatchSchema,
  parseSnippet,
  searchQuerySchema,
  publishSchema,
  spaceCreateSchema,
  spacePatchSchema,
  userUpdateSchema,
} from '../src/index.ts'

describe('initialsOf', () => {
  it.each([
    ['Daniel', 'D'],
    ['Daniel Wijono', 'DW'],
    ['  ada   lovelace byron ', 'AB'],
    ['', '?'],
  ])('%s → %s', (name, out) => expect(initialsOf(name)).toBe(out))
})

describe('request schemas', () => {
  it('lower-case invite emails and default the role', () => {
    expect(inviteCreateSchema.parse({ email: 'New@Example.COM' })).toEqual({ email: 'new@example.com', siteRole: 'member' })
  })

  it('reject an empty user update', () => {
    expect(userUpdateSchema.safeParse({}).success).toBe(false)
    expect(userUpdateSchema.safeParse({ deactivated: true }).success).toBe(true)
  })

  it('trim group names', () => expect(groupInputSchema.parse({ name: '  Design  ' })).toEqual({ name: 'Design', description: '' }))
})

describe('space and page inputs', () => {
  it('normalizes space keys and fills defaults', () => {
    expect(spaceCreateSchema.parse({ key: ' eng2 ', name: 'Eng' })).toEqual({ key: 'ENG2', name: 'Eng', description: '', icon: '📁' })
    expect(spaceCreateSchema.safeParse({ key: '2ENG', name: 'Eng' }).success).toBe(false)
    expect(spaceCreateSchema.safeParse({ key: 'E', name: 'Eng' }).success).toBe(false)
  })

  it('requires something in a patch', () => {
    expect(spacePatchSchema.safeParse({}).success).toBe(false)
    expect(spacePatchSchema.parse({ icon: '🏠' })).toEqual({ icon: '🏠' })
    expect(pagePatchSchema.safeParse({}).success).toBe(false)
    expect(pagePatchSchema.parse({ icon: null })).toEqual({ icon: null })
  })

  it('fills page defaults', () => {
    expect(pageCreateSchema.parse({ spaceKey: 'ENG' })).toEqual({ spaceKey: 'ENG', parentId: null, title: 'Untitled', icon: null, html: '<p></p>', isBlogPost: false })
    expect(pageMoveSchema.parse({ parentId: null })).toEqual({ parentId: null, index: Number.MAX_SAFE_INTEGER })
    expect(publishSchema.parse({})).toEqual({ comment: '' })
  })
})

describe('comment and label inputs', () => {
  it('normalizes labels', () => {
    expect(labelsSchema.parse({ labels: [' On Call ', 'API'] })).toEqual({ labels: ['on-call', 'api'] })
    expect(labelsSchema.safeParse({ labels: ['-lead'] }).success).toBe(false)
  })

  it('trims comments and defaults the anchor', () => {
    expect(commentCreateSchema.parse({ body: ' Hi ' })).toEqual({ body: 'Hi', anchorText: null })
    expect(commentCreateSchema.safeParse({ body: ' ' }).success).toBe(false)
  })
})

describe('search inputs', () => {
  it('drops empty filters and applies defaults', () => {
    expect(searchQuerySchema.parse({ q: ' plan ', space: '', limit: '5' })).toEqual({ q: 'plan', sort: 'relevance', limit: 5 })
    expect(searchQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
  })

  it('splits marked snippets into plain parts', () => {
    expect(parseSnippet('the \u0001plan\u0002 for <b>\u0001plans\u0002')).toEqual([
      { text: 'the ', match: false },
      { text: 'plan', match: true },
      { text: ' for <b>', match: false },
      { text: 'plans', match: true },
    ])
    expect(parseSnippet('')).toEqual([])
  })
})
