import { useParams, useNavigate } from 'react-router-dom'
import { Eye, MoreHorizontal, Star } from 'lucide-react'
import { useContentStore, useSpace, usePageTree } from '../store/contentStore'
import { Button } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { NotFound } from './NotFound'

export function SpaceOverview() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const space = useSpace(spaceId)
  const tree = usePageTree(spaceId)
  const toggleSpaceStar = useContentStore((s) => s.toggleSpaceStar)

  if (!space) return <NotFound />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <div className="flex items-start gap-3 mb-1">
          <span className="text-4xl leading-none">{space.icon}</span>
          <div className="grow">
            <h1 className="t-content-title">{space.name}</h1>
            <p className="t-ui-sm text-(--color-text-secondary) mt-1">
              {space.key} &middot; {space.pageCount} pages &middot; {space.memberCount} members
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 pt-1">
            <Button variant="default" size="compact" icon={<Star strokeWidth={1.5} fill={space.starred ? 'currentColor' : 'none'} />} onClick={() => toggleSpaceStar(spaceId!)}>
              {space.starred ? 'Starred' : 'Star'}
            </Button>
            <Button variant="default" size="compact" icon={<Eye strokeWidth={1.5} />}>
              Watch
            </Button>
            <Menu
              align="end"
              trigger={<Button variant="subtle" iconOnly icon={<MoreHorizontal strokeWidth={1.5} />} aria-label="Space actions" />}
              items={[{ label: 'Space settings', onSelect: () => navigate(`/spaces/${spaceId}/settings`) }, { label: 'Export space' }]}
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
