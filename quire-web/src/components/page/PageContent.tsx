import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { Comment, WidthMode } from '../../types'
import { parsePageUrl } from '../../lib/pageUrl'
import { LinkPreviewCard } from './LinkPreviewCard'

const WIDTH_CLASS: Record<WidthMode, string> = {
  reading: 'max-w-[760px]',
  wide: 'max-w-[960px]',
  full: 'max-w-none',
}

const PREVIEW_DELAY_MS = 400

function unwrapAnchors(root: HTMLElement) {
  root.querySelectorAll('mark[data-comment-id]').forEach((mark) => {
    mark.replaceWith(...mark.childNodes)
  })
  root.normalize()
}

/** Wrap the first occurrence of each anchor's text in a clickable highlight. */
function wrapAnchors(root: HTMLElement, anchors: Comment[]) {
  for (const c of anchors) {
    if (!c.anchorText) continue
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const idx = node.data.indexOf(c.anchorText)
      if (idx === -1 || node.parentElement?.closest('mark[data-comment-id]')) continue
      const target = node.splitText(idx)
      target.splitText(c.anchorText.length)
      const mark = document.createElement('mark')
      mark.dataset.commentId = c.id
      mark.className = 'comment-anchor'
      mark.tabIndex = 0
      mark.setAttribute('role', 'button')
      mark.setAttribute('aria-label', `Comment on “${c.anchorText}”`)
      target.replaceWith(mark)
      mark.append(target)
      break
    }
  }
}

export function PageContent({
  html,
  widthMode,
  archived = false,
  anchors = [],
  onAnchorClick,
}: {
  html: string
  widthMode: WidthMode
  archived?: boolean
  /** Unresolved comments whose anchor text is highlighted in the body. */
  anchors?: Comment[]
  onAnchorClick?: (commentId: string) => void
}) {
  const navigate = useNavigate()
  const bodyRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [preview, setPreview] = useState<{ spaceId: string; pageId: string; rect: DOMRect } | null>(null)
  const anchorKey = anchors.map((c) => `${c.id}:${c.anchorText}`).join('|')

  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    unwrapAnchors(root)
    wrapAnchors(root, anchors)
    // anchorKey captures the anchors' identity; the array itself is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, anchorKey])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function internalLink(target: EventTarget | null) {
    const a = (target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return null
    const parsed = parsePageUrl(a.getAttribute('href') ?? '')
    return parsed ? { a, ...parsed } : null
  }

  function schedulePreview(target: EventTarget | null) {
    const link = internalLink(target)
    if (!link) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setPreview({ spaceId: link.spaceId, pageId: link.pageId, rect: link.a.getBoundingClientRect() }), PREVIEW_DELAY_MS)
  }

  function cancelPreview() {
    if (timer.current) clearTimeout(timer.current)
    setPreview(null)
  }

  return (
    <div className={clsx('mx-auto px-6 py-8', WIDTH_CLASS[widthMode])}>
      {/* Archived pages dim images only; text keeps full contrast (design.md §7). */}
      <div
        ref={bodyRef}
        className={clsx('prose max-w-none', archived && '[&_img]:opacity-70')}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const mark = (e.target as HTMLElement).closest('mark[data-comment-id]') as HTMLElement | null
          if (mark && onAnchorClick) {
            onAnchorClick(mark.dataset.commentId!)
            return
          }
          const link = internalLink(e.target)
          if (link) {
            e.preventDefault()
            cancelPreview()
            navigate(link.path)
          }
        }}
        onKeyDown={(e) => {
          const mark = (e.target as HTMLElement).closest('mark[data-comment-id]') as HTMLElement | null
          if (mark && onAnchorClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onAnchorClick(mark.dataset.commentId!)
          }
        }}
        onMouseOver={(e) => schedulePreview(e.target)}
        onMouseOut={(e) => {
          if (internalLink(e.target)) cancelPreview()
        }}
        onFocus={(e) => schedulePreview(e.target)}
        onBlur={cancelPreview}
      />
      {preview && <LinkPreviewCard spaceId={preview.spaceId} pageId={preview.pageId} rect={preview.rect} />}
    </div>
  )
}
