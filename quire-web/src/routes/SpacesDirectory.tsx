import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronDown, Plus, Star } from 'lucide-react'
import { useCurrentUser } from '../hooks/useSession'
import { useUserLookup } from '../queries/users'
import { Button } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { CreateSpaceModal } from '../components/create/CreateSpaceModal'
import { useSpaceList, useToggleSpaceStar } from '../queries/spaces'

type Filter = 'all' | 'mine' | 'starred' | 'archived'
type Sort = 'name' | 'recent'

export function SpacesDirectory() {
  const navigate = useNavigate()
  const spaces = useSpaceList()
  const me = useCurrentUser()
  const userById = useUserLookup()
  const toggleSpaceStar = useToggleSpaceStar()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = spaces
    if (filter === 'mine') list = list.filter((s) => s.ownerId === me.id)
    else if (filter === 'starred') list = list.filter((s) => s.starred)
    else if (filter === 'archived') list = list.filter((s) => s.archived)
    else list = list.filter((s) => !s.archived)

    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')))
  }, [spaces, filter, sort, me.id])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 py-8">
        <div className="flex items-center mb-5">
          <h1 className="t-content-h1 grow">Spaces</h1>
          <Button variant="primary" icon={<Plus strokeWidth={1.75} />} onClick={() => setCreateOpen(true)}>
            Create space
          </Button>
        </div>

        <div className="flex items-center gap-1 mb-4">
          {(['all', 'mine', 'starred', 'archived'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                't-ui-md-medium h-8 px-3 rounded-(--radius-sm) capitalize',
                filter === f ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
              )}
            >
              {f}
            </button>
          ))}
          <Menu
            align="end"
            trigger={
              <button className="ml-auto t-ui-md-medium h-8 px-3 rounded-(--radius-sm) text-(--color-text-secondary) hover:bg-(--color-bg-hover) inline-flex items-center gap-1">
                Sort: {sort === 'name' ? 'Name' : 'Recently active'} <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            }
            items={[
              { label: 'Name', onSelect: () => setSort('name') },
              { label: 'Recently active', onSelect: () => setSort('recent') },
            ]}
          />
        </div>

        <div className="rounded-(--radius-md) border border-(--color-border-default) bg-(--color-bg-canvas) divide-y divide-(--color-border-default)">
          {filtered.length === 0 && <p className="t-ui-md text-(--color-text-secondary) text-center py-10">No spaces match this filter.</p>}
          {filtered.map((s) => {
            const owner = userById(s.ownerId)
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 h-16 hover:bg-(--color-bg-hover)">
                <button onClick={() => navigate(`/spaces/${s.id}`)} className="flex items-center gap-3 min-w-0 grow text-left">
                  <span className="text-xl shrink-0">{s.icon}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="t-ui-md-medium truncate">{s.name}</span>
                      <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{s.key}</span>
                    </span>
                    <span className="t-ui-sm text-(--color-text-secondary) block truncate">{s.description}</span>
                  </span>
                </button>
                <span className="t-ui-sm text-(--color-text-secondary) hidden sm:block w-32 shrink-0">{owner.name}</span>
                <span className="t-ui-sm text-(--color-text-secondary) hidden md:block w-24 shrink-0">{s.memberCount} members</span>
                <span className="t-ui-sm text-(--color-text-secondary) hidden md:block w-28 shrink-0">{s.lastActivity}</span>
                <button
                  onClick={() => toggleSpaceStar.mutate(s)}
                  aria-label={s.starred ? 'Unstar space' : 'Star space'}
                  className="shrink-0 text-(--color-text-secondary) hover:text-(--color-text-primary)"
                >
                  <Star className="w-4 h-4" strokeWidth={1.5} fill={s.starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
