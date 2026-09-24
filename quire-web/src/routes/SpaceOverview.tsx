import { useParams, useNavigate } from 'react-router-dom'
import { Eye, MoreHorizontal, Star } from 'lucide-react'
import { countNodes } from '../lib/tree'
import { usePageTree } from '../queries/pages'
import { useUIStore } from '../store/uiStore'
import { downloadFile } from '../lib/download'
import { Button } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { useToggleSpaceStar, useToggleSpaceWatch } from '../queries/spaces'
import { useSpaceRoute } from '../components/space/useSpaceRoute'

export function SpaceOverview() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const { space, fallback } = useSpaceRoute(spaceId)
  const tree = usePageTree(spaceId)
  const toggleSpaceStar = useToggleSpaceStar()
  const toggleSpaceWatch = useToggleSpaceWatch()
  const pushToast = useUIStore((s) => s.pushToast)

  if (!space) return fallback
  const pageCount = countNodes(tree)

  function exportSpace() {
    if (!space) return
    // The page outline as this person sees it; page bodies stay on the server.
    const body = JSON.stringify({ space, tree }, null, 2)
    downloadFile(`${space.key.toLowerCase()}-export.json`, body)
    pushToast({ message: `Exported ${pageCount} pages`, tone: 'success' })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <div className="flex items-start gap-3 mb-1">
          <span className="text-4xl leading-none">{space.icon}</span>
          <div className="grow">
            <h1 className="t-content-title">{space.name}</h1>
            <p className="t-ui-sm text-(--color-text-secondary) mt-1">
              {space.key} &middot; {pageCount} page{pageCount === 1 ? '' : 's'} &middot; {space.memberCount} members
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 pt-1">
            <Button variant="default" size="compact" aria-pressed={space.starred} icon={<Star strokeWidth={1.5} fill={space.starred ? 'currentColor' : 'none'} />} onClick={() => toggleSpaceStar.mutate(space)}>
              {space.starred ? 'Starred' : 'Star'}
            </Button>
            <Button
              variant="default"
              size="compact"
              icon={<Eye strokeWidth={1.5} />}
              aria-pressed={Boolean(space.watched)}
              onClick={() => {
                toggleSpaceWatch.mutate(space)
                pushToast({ message: space.watched ? 'Stopped watching this space' : 'Watching this space', tone: 'success' })
              }}
            >
              {space.watched ? 'Watching' : 'Watch'}
            </Button>
            <Menu
              align="end"
              trigger={<Button variant="subtle" iconOnly icon={<MoreHorizontal strokeWidth={1.5} />} aria-label="Space actions" />}
              items={[{ label: 'Space settings', onSelect: () => navigate(`/spaces/${spaceId}/settings`) }, { label: 'Export space', onSelect: exportSpace }]}
            />
          </div>
        </div>

        <div className="h-px bg-(--color-border-default) my-6" />

        <div className="prose">
          <p>{space.description}</p>
          {tree.length > 0 && (
            <>
              <h2>In this space</h2>
              <ul>
                {tree.map((n) => (
                  <li key={n.id}>
                    <button className="text-(--color-text-link) hover:underline text-left" onClick={() => navigate(`/spaces/${spaceId}/pages/${n.id}`)}>
                      {n.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
