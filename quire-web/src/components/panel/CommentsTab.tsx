import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useAddComment, useComments } from '../../queries/comments'
import type { Page } from '../../types'
import { CommentThread } from './CommentThread'
import { Button } from '../ui/Button'

export function CommentsTab({ page }: { page: Page }) {
  const [showResolved, setShowResolved] = useState(false)
  const [draft, setDraft] = useState('')
  const comments = useComments(page.id)
  const addComment = useAddComment(page.id)
  const pushToast = useUIStore((s) => s.pushToast)
  const pendingAnchor = useUIStore((s) => s.pendingCommentAnchor)
  const setPendingAnchor = useUIStore((s) => s.setPendingCommentAnchor)

  const all = comments.data ?? []
  const visible = all.filter((c) => showResolved || !c.resolved)
  const resolvedCount = all.filter((c) => c.resolved).length
  const canComment = Boolean(page.access?.comment)

  function submit() {
    if (!draft.trim() || addComment.isPending) return
    addComment.mutate(
      { body: draft.trim(), anchorText: pendingAnchor ?? null },
      {
        onSuccess: () => {
          setDraft('')
          setPendingAnchor(null)
          pushToast({ message: 'Comment added', tone: 'success' })
        },
      },
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className="t-ui-sm text-(--color-text-secondary)">
          {visible.length} comment{visible.length === 1 ? '' : 's'}
        </span>
        {resolvedCount > 0 && (
          <button onClick={() => setShowResolved((v) => !v)} className="t-ui-sm-medium text-(--color-text-link)">
            {showResolved ? 'Hide' : 'Show'} resolved ({resolvedCount})
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3">
        {comments.isPending ? (
          <p className="t-ui-md text-(--color-text-secondary) text-center mt-8">Loading comments…</p>
        ) : comments.isError ? (
          <p role="alert" className="t-ui-md text-(--status-danger-text) text-center mt-8">
            Couldn’t load comments.{' '}
            <button className="underline" onClick={() => void comments.refetch()}>
              Try again
            </button>
          </p>
        ) : visible.length === 0 ? (
          <p className="t-ui-md text-(--color-text-secondary) text-center mt-8">No comments yet.</p>
        ) : (
          visible.map((c) => <CommentThread key={c.id} pageId={page.id} comment={c} canComment={canComment} />)
        )}
      </div>
      {canComment && (
      <div className="p-3 border-t border-(--color-border-default) shrink-0">
        {pendingAnchor && (
          <div className="flex items-start gap-1.5 mb-2 t-ui-sm text-(--color-text-secondary)">
            <p className="grow pl-2 border-l-2 border-(--color-highlight) italic">&ldquo;{pendingAnchor}&rdquo;</p>
            <button onClick={() => setPendingAnchor(null)} className="shrink-0 hover:text-(--color-text-primary)" aria-label="Remove selected text">
              &times;
            </button>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        {addComment.isError && (
          <p role="alert" className="t-ui-sm text-(--status-danger-text) mt-1">
            Couldn’t post your comment: {addComment.error.message}. It’s still here, so you can try again.
          </p>
        )}
        <div className="flex justify-end mt-2">
          <Button variant="primary" size="compact" onClick={submit} disabled={!draft.trim()} loading={addComment.isPending}>
            Comment
          </Button>
        </div>
      </div>
      )}
    </div>
  )
}
