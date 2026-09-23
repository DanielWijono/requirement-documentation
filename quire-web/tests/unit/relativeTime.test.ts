import { describe, expect, it } from 'vitest'
import { ageInDays } from '../../src/lib/relativeTime'

describe('ageInDays', () => {
  it.each([
    ['Just now', 0],
    ['10 minutes ago', 0],
    ['3 hours ago', 0],
    ['Yesterday', 1],
    ['4 days ago', 4],
    ['2 weeks ago', 14],
    ['a month ago', 30],
    ['2 months ago', 60],
  ])('%s → %d', (label, days) => expect(ageInDays(label)).toBe(days))

  it('unknown labels sort as oldest', () => expect(ageInDays('sometime')).toBe(Infinity))
})
