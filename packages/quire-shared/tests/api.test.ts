import { describe, expect, it } from 'vitest'
import {
  groupInputSchema,
  initialsOf,
  inviteCreateSchema,
  pageCreateSchema,
  pageMoveSchema,
  pagePatchSchema,
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
