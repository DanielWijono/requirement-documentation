import { createPortal } from 'react-dom'
import { canView, useContentStore } from '../../store/contentStore'
import { useSpace } from '../../queries/spaces'

/** Hover card for internal page links (design.md §9.4). Restricted pages never leak their title. */
export function LinkPreviewCard({ spaceId, pageId, rect }: { spaceId: string; pageId: string; rect: DOMRect }) {
  const page = useContentStore((s) => s.pages[pageId])
  const space = useSpace(spaceId)
  const visible = page && page.spaceId === spaceId && canView(page) && page.state !== 'deleted'
  const excerpt = visible
    ? (page.publishedHtml ?? page.contentHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    : ''

  return createPortal(
    <div
      role="tooltip"
      style={{ position: 'fixed', left: rect.left, top: rect.bottom + 6, width: 320, boxShadow: 'var(--elevation-2)' }}
      className="z-(--z-popover) p-3 rounded-(--radius-md) bg-(--color-bg-raised) pointer-events-none"
    >
      {visible ? (
        <>
          <p className="t-ui-md-medium">{page.title}</p>
          <p className="t-ui-sm text-(--color-text-secondary) mb-1.5">
            {space?.name} · Updated {page.updatedRelative}
          </p>
          <p className="t-ui-sm">{excerpt}</p>
        </>
      ) : (
        <p className="t-ui-sm text-(--color-text-secondary)">{page ? 'You don’t have access to this page.' : 'This page doesn’t exist.'}</p>
      )}
    </div>,
    document.body,
  )
}
