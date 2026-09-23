export type DiffOp = 'equal' | 'add' | 'remove'

export interface DiffPart {
  op: DiffOp
  text: string
}

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, summary, td, th'

/** Plain text of each block element, in document order. Nested blocks are not repeated. */
export function htmlToBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const blocks = [...doc.body.querySelectorAll(BLOCK_SELECTOR)].filter((el) => !el.querySelector(BLOCK_SELECTOR))
  return blocks.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** Word-level diff of two token lists using a longest-common-subsequence table. */
function diffTokens(a: string[], b: string[]): DiffPart[] {
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffPart[] = []
  const push = (op: DiffOp, text: string) => {
    const last = out.at(-1)
    if (last && last.op === op) last.text += text
    else out.push({ op, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('remove', a[i++])
    } else {
      push('add', b[j++])
    }
  }
  while (i < n) push('remove', a[i++])
  while (j < m) push('add', b[j++])
  return out
}

function tokenize(blocks: string[]): string[] {
  // Keep whitespace as its own token so the output reads naturally; '\n' marks a block boundary.
  return blocks.flatMap((block, idx) => [...(idx > 0 ? ['\n'] : []), ...block.split(/(\s+)/).filter(Boolean)])
}

/** Diff two HTML bodies. Returns one list of parts per output paragraph. */
export function diffHtml(before: string, after: string): DiffPart[][] {
  const parts = diffTokens(tokenize(htmlToBlocks(before)), tokenize(htmlToBlocks(after)))
  const paragraphs: DiffPart[][] = [[]]
  for (const part of parts) {
    const pieces = part.text.split('\n')
    pieces.forEach((piece, k) => {
      if (k > 0) paragraphs.push([])
      if (piece) paragraphs.at(-1)!.push({ op: part.op, text: piece })
    })
  }
  return paragraphs.filter((p) => p.length > 0)
}

export function hasChanges(paragraphs: DiffPart[][]): boolean {
  return paragraphs.some((p) => p.some((part) => part.op !== 'equal' && part.text.trim() !== ''))
}
