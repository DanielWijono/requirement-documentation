import clsx from 'clsx'
import { X } from 'lucide-react'
import type { Page } from '../../types'
import { useUIStore } from '../../store/uiStore'
import type { RightPanelTab } from '../../store/uiStore'
import { CommentsTab } from './CommentsTab'
import { DetailsTab } from './DetailsTab'
import { HistoryTab } from './HistoryTab'
import { useReturnFocus } from '../../hooks/useReturnFocus'

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'comments', label: 'Comments' },
  { id: 'details', label: 'Details' },
  { id: 'history', label: 'History' },
]

export function RightPanel({ page }: { page: Page }) {
  const open = useUIStore((s) => s.rightPanelOpen)
  const tab = useUIStore((s) => s.rightPanelTab)
  const setTab = useUIStore((s) => s.setRightPanelTab)
  const close = useUIStore((s) => s.closeRightPanel)
  useReturnFocus(open)

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-(--z-panel) bg-black/30 lg:hidden" onClick={close} aria-hidden />
      <aside
        aria-label="Page panel"
        className={clsx(
          'w-full sm:w-[360px] shrink-0 bg-(--color-bg-raised) border-l border-(--color-border-default) flex flex-col',
          'fixed right-0 top-0 bottom-0 z-(--z-panel) lg:static lg:z-auto',
        )}
      >
        <div className="h-12 shrink-0 flex items-center px-2 border-b border-(--color-border-default) gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                't-ui-md-medium h-8 px-3 rounded-(--radius-sm)',
                tab === t.id ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
              )}
            >
              {t.label}
              {t.id === 'comments' && page.comments.filter((c) => !c.resolved).length > 0 && (
                <span className="ml-1.5">{page.comments.filter((c) => !c.resolved).length}</span>
              )}
            </button>
          ))}
          <button onClick={close} className="ml-auto w-7 h-7 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover) text-(--color-text-secondary)" aria-label="Close panel">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {tab === 'comments' && <CommentsTab page={page} />}
          {tab === 'details' && <DetailsTab page={page} />}
          {tab === 'history' && <HistoryTab page={page} />}
        </div>
      </aside>
    </>
  )
}
