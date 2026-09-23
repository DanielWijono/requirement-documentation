import type { ReactNode } from 'react'
import { ArchiveRestore, Info } from 'lucide-react'
import type { Page } from '../../types'
import { userById } from '../../data/mockData'
import { useContentStore } from '../../store/contentStore'
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
  const discardChanges = useContentStore((s) => s.discardChanges)
  const restorePage = useContentStore((s) => s.restorePage)
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
        <button
          className="t-ui-sm-medium underline"
          onClick={() => {
            discardChanges(page.id)
            if (viewingDraft) onToggleDraftView()
            pushToast({ message: 'Changes discarded', tone: 'info' })
          }}
        >
          Discard
        </button>
      </Banner>
    )
  }

  if (page.state === 'archived') {
    return (
      <Banner tone="neutral" icon={<ArchiveRestore className="w-4 h-4" strokeWidth={1.5} />}>
        <span className="grow">Archived</span>
        <button
          className="t-ui-sm-medium underline"
          onClick={() => {
            restorePage(page.id)
            pushToast({ message: 'Page restored', tone: 'success' })
          }}
        >
          Restore
        </button>
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
