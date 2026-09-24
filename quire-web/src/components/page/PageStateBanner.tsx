import type { ReactNode } from 'react'
import { ArchiveRestore, Info } from 'lucide-react'
import type { Page } from '../../types'
import { useUserLookup } from '../../queries/users'
import { useDiscardDraft, useTrashAction } from '../../queries/pages'
import { useUIStore } from '../../store/uiStore'

export function PageStateBanner({
  page,
  viewingDraft,
  onToggleDraftView,
}: {
  page: Page
  viewingDraft: boolean
  onToggleDraftView: () => void
}) {
  const userById = useUserLookup()
  const discardDraft = useDiscardDraft()
  const trash = useTrashAction()
  const pushToast = useUIStore((s) => s.pushToast)

  if (page.state === 'draft') {
    return (
      <Banner tone="neutral">
        Only you and collaborators can see this page.
      </Banner>
    )
  }

  if (page.state === 'published-unpublished-changes') {
    const editor = userById(page.updatedById)
    return (
      <Banner tone="warning">
        <span className="grow">
          {viewingDraft ? 'Viewing unpublished changes' : 'Unpublished changes'} by {editor.name}
        </span>
        <button className="t-ui-sm-medium underline" onClick={onToggleDraftView}>
          {viewingDraft ? 'Show published' : 'View'}
        </button>
        {page.access?.edit && (
          <button
            className="t-ui-sm-medium underline"
            onClick={() =>
              discardDraft.mutate(page, {
                onSuccess: () => {
                  if (viewingDraft) onToggleDraftView()
                  pushToast({ message: 'Changes discarded', tone: 'info' })
                },
                onError: (err) => pushToast({ message: `Couldn’t discard the changes: ${err.message}`, tone: 'danger' }),
              })
            }
          >
            Discard
          </button>
        )}
      </Banner>
    )
  }

  if (page.state === 'archived') {
    return (
      <Banner tone="neutral" icon={<ArchiveRestore className="w-4 h-4" strokeWidth={1.5} />}>
        <span className="grow">Archived</span>
        {page.access?.delete && (
          <button
            className="t-ui-sm-medium underline"
            onClick={() =>
              trash.mutate(
                { pageId: page.id, action: 'restore' },
                {
                  onSuccess: () => pushToast({ message: 'Page restored', tone: 'success' }),
                  onError: (err) => pushToast({ message: `Couldn’t restore the page: ${err.message}`, tone: 'danger' }),
                },
              )
            }
          >
            Restore
          </button>
        )}
      </Banner>
    )
  }

  return null
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'neutral' | 'warning'
  icon?: ReactNode
  children: ReactNode
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-(--status-warning-subtle) text-(--status-warning-text)'
      : 'bg-(--status-neutral-subtle) text-(--status-neutral-text)'
  return (
    <div className={`t-ui-md flex items-center gap-2 px-4 h-10 rounded-(--radius-sm) ${toneClass}`}>
      {icon ?? <Info className="w-4 h-4" strokeWidth={1.5} />}
      {children}
    </div>
  )
}
