const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }

/** Plain text of an HTML fragment, for search and word counts. Block boundaries become spaces. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name: string) => {
      const lower = name.toLowerCase()
      if (lower in ENTITIES) return ENTITIES[lower]
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
      if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
      return m
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(text: string): number {
  return text ? text.split(' ').length : 0
}
