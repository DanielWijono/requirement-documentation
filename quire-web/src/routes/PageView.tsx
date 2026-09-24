import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import { PageHeader } from '../components/page/PageHeader'
import { PageContent } from '../components/page/PageContent'
import { usePageRoute } from '../components/page/usePageRoute'
import { RightPanel } from '../components/panel/RightPanel'
import { Button } from '../components/ui/Button'
import { useComments } from '../queries/comments'
import { homeKeys } from '../queries/home'
import { recordView, useTogglePageStar, useTrashAction } from '../queries/pages'
import type { Page } from '../types'

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function PageView() {
  const { pageId, spaceId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { page, fallback } = usePageRoute(pageId)
  const togglePageStar = useTogglePageStar()
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const setPendingCommentAnchor = useUIStore((s) => s.setPendingCommentAnchor)
  const focusComment = useUIStore((s) => s.focusComment)
  const comments = useComments(page?.id ?? '')
  // Page id whose unpublished changes are being previewed; resets naturally on navigation.
  const [draftViewFor, setDraftViewFor] = useState<string | null>(null)

  useEffect(() => {
    if (!page) return
    void recordView(page.id).then(() => qc.invalidateQueries({ queryKey: homeKeys.recent }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || !page) return
      if (e.key.toLowerCase() === 'e' && page.access?.edit) navigate(`/spaces/${spaceId}/pages/${page.id}/edit`)
      else if (e.key.toLowerCase() === 'm') {
        // "Add comment on selection" (design.md §9.1): selected body text becomes the comment's anchor.
        const selection = window.getSelection()
        const text = selection?.toString().trim()
        const inBody = selection?.anchorNode && document.getElementById('page-scroll-region')?.contains(selection.anchorNode)
        if (text && inBody) setPendingCommentAnchor(text)
        openRightPanel('comments')
      } else if (e.key.toLowerCase() === 's') togglePageStar.mutate({ page, on: !page.starred })
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [page, spaceId, navigate, openRightPanel, togglePageStar, setPendingCommentAnchor])

  if (!page) return fallback
  if (page.state === 'deleted') return <DeletedPage page={page} />

  const viewingDraft = draftViewFor === page.id
  const html = page.state === 'published-unpublished-changes' && !viewingDraft ? (page.publishedHtml ?? page.contentHtml) : page.contentHtml

  return (
    <div className="flex-1 flex min-w-0">
      <div id="page-scroll-region" className="flex-1 min-w-0 overflow-y-auto">
        <PageHeader page={page} viewingDraft={viewingDraft} onToggleDraftView={() => setDraftViewFor(viewingDraft ? null : page.id)} />
        <PageContent
          html={html}
          widthMode={page.widthMode}
          archived={page.state === 'archived'}
          anchors={(comments.data ?? []).filter((c) => !c.resolved && c.anchorText)}
          onAnchorClick={focusComment}
        />
      </div>
      <RightPanel page={page} />
    </div>
  )
}

function DeletedPage({ page }: { page: Page }) {
  const restore = useTrashAction()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <h1 className="t-content-h2">This page was deleted</h1>
      <p className="t-ui-md text-(--color-text-secondary) max-w-[420px]">It is in Trash. A space admin can restore it.</p>
      {page.access?.delete && (
        <Button variant="primary" loading={restore.isPending} onClick={() => restore.mutate({ pageId: page.id, action: 'restore' })}>
          Restore page
        </Button>
      )}
      {restore.isError && (
        <p role="alert" className="t-ui-sm text-(--status-danger-text)">
          Couldn’t restore it: {restore.error.message}
        </p>
      )}
    </div>
  )
}
