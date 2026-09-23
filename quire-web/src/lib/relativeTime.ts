const UNIT_DAYS: Record<string, number> = { minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 }

/**
 * Approximate age in days of a relative label such as "3 hours ago", "Yesterday" or "2 weeks ago".
 * Unknown labels sort as oldest.
 */
export function ageInDays(label: string): number {
  const text = label.trim().toLowerCase()
  if (text === 'just now' || text === 'today') return 0
  if (text === 'yesterday') return 1
  const m = /^(\d+|a|an)\s+(minute|hour|day|week|month|year)s?\s+ago$/.exec(text)
  if (!m) return Number.POSITIVE_INFINITY
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])
  return n * UNIT_DAYS[m[2]]
}
