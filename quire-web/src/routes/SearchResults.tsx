import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useContentStore, ancestorChainIn, isLivePage } from '../store/contentStore'
import { userById } from '../data/mockData'

type Sort = 'relevance' | 'modified'

function highlight(text: string, query: string) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-(--color-highlight) text-inherit rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function SearchResults() {
  const navigate = useNavigate()
  const spaces = useContentStore((s) => s.spaces)
  const pages = useContentStore((s) => s.pages)
  const pageTree = useContentStore((s) => s.pageTree)

  const [query, setQuery] = useState('')
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null)
  const [contributorFilter, setContributorFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('relevance')

  const allPages = Object.values(pages).filter(isLivePage)

  const results = useMemo(() => {
    let list = allPages
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.contentHtml.toLowerCase().includes(q))
    }
    if (spaceFilter) list = list.filter((p) => p.spaceId === spaceFilter)
    if (contributorFilter) list = list.filter((p) => p.updatedById === contributorFilter || p.ownerId === contributorFilter)
    if (sort === 'modified') list = [...list].sort((a, b) => a.updatedRelative.localeCompare(b.updatedRelative))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPages, query, spaceFilter, contributorFilter, sort])

  const activeFilterLabels: string[] = []
  if (spaceFilter) activeFilterLabels.push(spaces.find((s) => s.id === spaceFilter)?.name ?? '')
  if (contributorFilter) activeFilterLabels.push(userById(contributorFilter).name)

  return (
    <div className="flex-1 flex min-w-0">
      <aside className="w-[240px] shrink-0 border-r border-(--color-border-default) p-4 flex flex-col gap-5 overflow-y-auto">
        <FilterGroup label="Space">
          <FilterOption label="All spaces" active={!spaceFilter} onClick={() => setSpaceFilter(null)} />
          {spaces
            .filter((s) => !s.archived)
            .map((s) => (
              <FilterOption key={s.id} label={s.name} active={spaceFilter === s.id} onClick={() => setSpaceFilter(s.id)} />
            ))}
        </FilterGroup>
        <FilterGroup label="Type">
          <FilterOption label="Page" active onClick={() => {}} />
        </FilterGroup>
        <FilterGroup label="Contributor">
          <FilterOption label="Anyone" active={!contributorFilter} onClick={() => setContributorFilter(null)} />
          {['u.daniel', 'u.adel', 'u.priya', 'u.marcus', 'u.wren'].map((id) => (
            <FilterOption key={id} label={userById(id).name} active={contributorFilter === id} onClick={() => setContributorFilter(id)} />
          ))}
        </FilterGroup>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-2 h-10 px-3 rounded-(--radius-sm) border border-(--color-border-strong)">
            <Search className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this site"
              className="t-ui-md grow bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center justify-between mb-4">
            <p className="t-ui-sm text-(--color-text-secondary)">{results.length} results</p>
            <div className="flex items-center gap-1">
              {(['relevance', 'modified'] as Sort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={clsx(
                    't-ui-sm-medium h-7 px-2 rounded-(--radius-sm) capitalize',
                    sort === s ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
                  )}
                >
                  {s === 'relevance' ? 'Relevance' : 'Last modified'}
                </button>
              ))}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-16">
              <p className="t-ui-md text-(--color-text-secondary) mb-1">No results for &ldquo;{query}&rdquo;.</p>
              {activeFilterLabels.length > 0 && (
                <p className="t-ui-sm text-(--color-text-secondary)">
                  Try removing the <strong>{activeFilterLabels[0]}</strong> filter.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {results.map((p) => {
                const space = spaces.find((s) => s.id === p.spaceId)
                const chain = ancestorChainIn(pageTree[p.spaceId] ?? [], p.id).slice(0, -1)
                const snippetSource = p.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                return (
                  <button key={p.id} onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}`)} className="text-left">
                    <p className="t-ui-md-medium text-(--color-text-link)">{highlight(p.title, query)}</p>
                    <p className="t-ui-sm text-(--color-text-secondary) mb-1">
                      {space?.name}
                      {chain.length > 0 && ` / ${chain.map((c) => c.title).join(' / ')}`}
                      {' · '}
                      {p.updatedRelative}
                    </p>
                    <p className="t-ui-md text-(--color-text-secondary) line-clamp-2">{highlight(snippetSource.slice(0, 160), query)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="t-ui-sm-medium text-(--color-text-secondary) mb-1.5">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function FilterOption({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        't-ui-md text-left h-7 px-2 rounded-(--radius-sm) truncate',
        active ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-primary) hover:bg-(--color-bg-hover)',
      )}
    >
      {label}
    </button>
  )
}
