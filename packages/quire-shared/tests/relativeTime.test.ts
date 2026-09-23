import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/index.ts'

const now = new Date('2026-09-23T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it.each([
    [ago(10_000), 'Just now'],
    [ago(MIN), '1 minute ago'],
    [ago(10 * MIN), '10 minutes ago'],
    [ago(3 * HOUR), '3 hours ago'],
    [ago(DAY), 'Yesterday'],
    [ago(4 * DAY), '4 days ago'],
    [ago(14 * DAY), '2 weeks ago'],
    [ago(60 * DAY), '2 months ago'],
    [ago(400 * DAY), '1 year ago'],
  ])('%s → %s', (iso, label) => expect(relativeTime(iso, now)).toBe(label))

  it('treats future timestamps as just now', () => expect(relativeTime(ago(-5 * MIN), now)).toBe('Just now'))

  it('returns an empty label for invalid input', () => expect(relativeTime('not a date', now)).toBe(''))

  it('defaults to the current time', () => expect(relativeTime(new Date().toISOString())).toBe('Just now'))
})
