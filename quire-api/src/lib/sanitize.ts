import sanitizeHtml from 'sanitize-html'

/**
 * The editor's schema as an allowlist: StarterKit, highlight, links, task lists, images, tables and
 * Quire's callout / expand / mention nodes. Anything else (scripts, event handlers, iframes, inline
 * styles beyond table widths, javascript: URLs) is dropped before a body is stored.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup', 'span', 'a',
    'ul', 'ol', 'li', 'label', 'input', 'div', 'details', 'summary', 'img',
    'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'class'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    ol: ['start', 'type'],
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    input: ['type', 'checked', 'disabled'],
    div: ['data-callout'],
    details: ['data-expand', 'open'],
    span: ['class', 'data-mention', 'userid', 'name'],
    mark: ['data-color'],
    table: ['style'],
    col: ['style', 'width'],
    th: ['colspan', 'rowspan', 'colwidth', 'style'],
    td: ['colspan', 'rowspan', 'colwidth', 'style'],
  },
  allowedClasses: {
    a: ['smart-link'],
    span: ['mention'],
    code: [/^language-[\w-]+$/],
    pre: [/^language-[\w-]+$/],
  },
  allowedStyles: {
    '*': { width: [/^\d+(\.\d+)?px$/], 'min-width': [/^\d+(\.\d+)?px$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  // Relative links (/spaces/…/pages/…) are how the editor links between pages.
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    input: (tagName, attribs) => (attribs.type === 'checkbox' ? { tagName, attribs } : { tagName: 'span', attribs: {} }),
    a: (tagName, attribs) => (attribs.target === '_blank' ? { tagName, attribs: { ...attribs, rel: 'noopener noreferrer nofollow' } } : { tagName, attribs }),
  },
}

export function sanitizeBody(html: string): string {
  const clean = sanitizeHtml(html, OPTIONS).trim()
  return clean === '' ? '<p></p>' : clean
}
