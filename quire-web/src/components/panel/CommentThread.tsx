import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Check, MessageCircle, MoreHorizontal, SmilePlus } from 'lucide-react'
import type { Comment } from '../../types'
import { useUserLookup } from '../../queries/users'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { useReply, useResolveComment } from '../../queries/comments'
import { useUIStore } from '../../store/uiStore'

export function CommentThread({ pageId, comment, canComment = true }: { pageId: string; comment: Comment & { deleted?: boolean }; canComment?: boolean }) {
  const userById = useUserLookup()
  const author = userById(comment.authorId)
  const resolve = useResolveComment(pageId)
  const reply = useReply(pageId)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const focused = useUIStore((s) => s.focusedCommentId === comment.id)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focused])

  function submitReply() {
    if (!replyText.trim() || reply.isPending) return
    reply.mutate(
      { commentId: comment.id, body: replyText.trim() },
      {
        onSuccess: () => {
          setReplyText('')
          setReplyOpen(false)
        },
      },
    )
  }

  return (
    <div
      ref={ref}
      id={`comment-${comment.id}`}
      aria-current={focused || undefined}
      className={clsx(
        'p-3 rounded-(--radius-md) border',
        focused ? 'border-(--color-border-focus) ring-1 ring-(--color-border-focus)' : 'border-(--color-border-default)',
        comment.resolved && 'opacity-60',
      )}
    >
      {comment.anchorText && (
        <p className="t-ui-sm text-(--color-text-secondary) mb-2 pl-2 border-l-2 border-(--color-highlight) italic">
          &ldquo;{comment.anchorText}&rdquo;
        </p>
      )}
      <div className="flex items-start gap-2">
        <Avatar user={author} size={24} />
        <div className="grow min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="t-ui-md-medium">{author.name}</span>
            <span className="t-ui-sm text-(--color-text-secondary)">{comment.relativeTime}</span>
          </div>
          <p className={clsx('t-ui-md mt-0.5', comment.deleted && 'italic text-(--color-text-secondary)')}>{comment.deleted ? 'This comment was deleted.' : comment.body}</p>
          {canComment && !comment.deleted && (
          <div className="flex items-center gap-3 mt-1.5">
            <button onClick={() => setReplyOpen((v) => !v)} className="t-ui-sm-medium text-(--color-text-secondary) hover:text-(--color-text-primary)">
              Reply
            </button>
            <button className="t-ui-sm-medium text-(--color-text-secondary) hover:text-(--color-text-primary) inline-flex items-center gap-1">
              <SmilePlus className="w-3.5 h-3.5" strokeWidth={1.5} /> React
            </button>
            <button
              onClick={() => resolve.mutate({ commentId: comment.id, resolved: !comment.resolved })}
              className="t-ui-sm-medium text-(--color-text-secondary) hover:text-(--color-text-primary) inline-flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} /> {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button className="ml-auto text-(--color-text-secondary) hover:text-(--color-text-primary)" aria-label="More">
              <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
          )}

          {comment.replies?.map((r) => {
            const rAuthor = userById(r.authorId)
            return (
              <div key={r.id} className="flex items-start gap-2 mt-3 pl-1">
                <Avatar user={rAuthor} size={24} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="t-ui-md-medium">{rAuthor.name}</span>
                    <span className="t-ui-sm text-(--color-text-secondary)">{r.relativeTime}</span>
                  </div>
                  <p className="t-ui-md mt-0.5">{r.body}</p>
                </div>
              </div>
            )
          })}

          {replyOpen && (
            <div className="mt-2 flex items-start gap-2">
              <MessageCircle className="w-4 h-4 mt-1.5 text-(--color-text-secondary)" strokeWidth={1.5} />
              <div className="grow flex flex-col items-end gap-1.5">
              <textarea
                autoFocus
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply…"
                rows={1}
                className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitReply()
                }}
              />
              {reply.isError && (
                <p role="alert" className="t-ui-sm text-(--status-danger-text) self-start">
                  Couldn’t post your reply: {reply.error.message}
                </p>
              )}
              <Button variant="primary" size="compact" onClick={submitReply} disabled={!replyText.trim()} loading={reply.isPending}>
                Reply
              </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
