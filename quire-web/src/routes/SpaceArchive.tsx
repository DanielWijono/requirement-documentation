import { useNavigate, useParams } from 'react-router-dom'
import { Archive } from 'lucide-react'
import { canView, useContentStore } from '../store/contentStore'
import { useUIStore } from '../store/uiStore'
import { Button } from '../components/ui/Button'
import { useSpaceRoute } from '../components/space/useSpaceRoute'

export function SpaceArchive() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const { space, fallback } = useSpaceRoute(spaceId)
  const pages = useContentStore((s) => s.pages)
  const restorePage = useContentStore((s) => s.restorePage)
  const pushToast = useUIStore((s) => s.pushToast)

  if (!space) return fallback
  const archived = Object.values(pages).filter((p) => p.spaceId === space.id && p.state === 'archived' && canView(p))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <h1 className="t-content-h1 mb-1 flex items-center gap-2">
          <Archive className="w-6 h-6" strokeWidth={1.5} /> Archived pages
        </h1>
        <p className="t-ui-md text-(--color-text-secondary) mb-6">Archived pages are hidden from the page tree and search in {space.name}.</p>
        {archived.length === 0 ? (
          <p className="t-ui-md text-(--color-text-secondary)">Nothing is archived in this space.</p>
        ) : (
          <ul className="rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default) bg-(--color-bg-canvas)">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 h-12">
                <button className="t-ui-md grow text-left truncate hover:underline" onClick={() => navigate(`/spaces/${space.id}/pages/${p.id}`)}>
                  {p.title}
                </button>
                <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{p.updatedRelative}</span>
                <Button
                  size="compact"
                  onClick={() => {
                    restorePage(p.id)
                    pushToast({ message: `Restored “${p.title}”`, tone: 'success' })
                  }}
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
