const PAGE_PATH = /^(?:https?:\/\/[^/]+)?(\/spaces\/([^/?#\s]+)\/pages\/([^/?#\s]+))\/?$/

/** Parse an internal page URL (absolute on this origin, or root-relative). */
export function parsePageUrl(text: string, origin = window.location.origin) {
  const trimmed = text.trim()
  if (/^https?:\/\//.test(trimmed) && !trimmed.startsWith(origin)) return null
  const m = PAGE_PATH.exec(trimmed)
  return m ? { path: m[1], spaceId: m[2], pageId: m[3] } : null
}
