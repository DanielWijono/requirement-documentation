import { describe, expect, it } from 'vitest'
import { groupInputSchema, initialsOf, inviteCreateSchema, userUpdateSchema } from '../src/index.ts'

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
