import { useNavigate, useParams } from 'react-router-dom'
import { Archive } from 'lucide-react'
import { relativeTime } from '@quire/shared'
import { useTrash, useTrashAction } from '../queries/pages'
import { useUIStore } from '../store/uiStore'
import { Button } from '../components/ui/Button'
import { useSpaceRoute } from '../components/space/useSpaceRoute'

export function SpaceArchive() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const { space, fallback } = useSpaceRoute(spaceId)
  const trash = useTrash(spaceId ?? '')
  const restore = useTrashAction()
  const pushToast = useUIStore((s) => s.pushToast)

  if (!space) return fallback
  const archived = (trash.data ?? []).filter((p) => p.status === 'archived')

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <h1 className="t-content-h1 mb-1 flex items-center gap-2">
          <Archive className="w-6 h-6" strokeWidth={1.5} /> Archived pages
        </h1>
        <p className="t-ui-md text-(--color-text-secondary) mb-6">Archived pages are hidden from the page tree and search in {space.name}.</p>
        {trash.isPending ? (
          <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
        ) : trash.isError ? (
          <p role="alert" className="t-ui-md text-(--status-danger-text)">
            Couldn’t load archived pages.{' '}
            <button className="underline" onClick={() => void trash.refetch()}>
              Try again
            </button>
          </p>
        ) : archived.length === 0 ? (
          <p className="t-ui-md text-(--color-text-secondary)">Nothing is archived in this space.</p>
        ) : (
          <ul className="rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default) bg-(--color-bg-canvas)">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 h-12">
                <button className="t-ui-md grow text-left truncate hover:underline" onClick={() => navigate(`/spaces/${space.id}/pages/${p.id}`)}>
                  {p.title}
                </button>
                <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{relativeTime(p.updatedAt)}</span>
                <Button
                  size="compact"
                  onClick={() =>
                    restore.mutate(
                      { pageId: p.id, action: 'restore' },
                      {
                        onSuccess: () => {
                          void trash.refetch()
                          pushToast({ message: `Restored “${p.title}”`, tone: 'success' })
                        },
                        onError: (err) => pushToast({ message: `Couldn’t restore “${p.title}”: ${err.message}`, tone: 'danger' }),
                      },
                    )
                  }
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
