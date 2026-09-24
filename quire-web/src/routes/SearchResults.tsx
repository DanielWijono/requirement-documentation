import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Search, SlidersHorizontal } from 'lucide-react'
import { relativeTime, type SearchFilter, type SnippetPart } from '@quire/shared'
import { useDebounced } from '../hooks/useDebounced'
import { useLabels } from '../queries/home'
import { useSearch } from '../queries/search'
import { useUserList, useUserLookup } from '../queries/users'
import { useSpaceList } from '../queries/spaces'

type Sort = 'relevance' | 'modified'
type TypeFilter = 'page' | 'blog'
type ModifiedFilter = 'today' | 'week' | 'month'

const MODIFIED_OPTIONS: { id: ModifiedFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Past 7 days' },
  { id: 'month', label: 'Past 30 days' },
]

interface Filters {
  space: string | null
  type: TypeFilter | null
  contributor: string | null
  modified: ModifiedFilter | null
  label: string | null
}

const NO_FILTERS: Filters = { space: null, type: null, contributor: null, modified: null, label: null }

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

/** The server marks the matched words; snippets are plain text, never HTML. */
function Snippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="bg-(--color-highlight) text-inherit rounded-sm">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

export function SearchResults() {
  const userById = useUserLookup()
  const users = useUserList()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const spaces = useSpaceList()
  const labelsQuery = useLabels()

  const query = params.get('q') ?? ''
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, contributor: params.get('contributor'), label: params.get('label') })
  const [sort, setSort] = useState<Sort>('relevance')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const q = useDebounced(query.trim(), 200)
  const search = useSearch({
    q,
    sort,
    space: filters.space ?? undefined,
    type: filters.type ?? undefined,
    contributor: filters.contributor ?? undefined,
    modified: filters.modified ?? undefined,
    label: filters.label ?? undefined,
    limit: 50,
  })
  const results = search.data?.results ?? []
  const total = search.data?.total ?? 0
  const labels = useMemo(() => {
    const names = (labelsQuery.data ?? []).map((l) => l.name)
    return filters.label && !names.includes(filters.label) ? [...names, filters.label].sort() : names.sort()
  }, [labelsQuery.data, filters.label])

  const filterNames: Record<keyof Filters, (v: string) => string> = {
    space: (v) => spaces.find((s) => s.id === v)?.name ?? v,
    type: (v) => (v === 'blog' ? 'Blog post' : 'Page'),
    contributor: (v) => userById(v).name,
    modified: (v) => MODIFIED_OPTIONS.find((o) => o.id === v)?.label ?? v,
    label: (v) => v,
  }

  // The most restrictive filter is the one whose removal brings back the most results.
  const mostRestrictive = useMemo(() => {
    let best: { key: keyof Filters; count: number } | null = null
    for (const [key, count] of Object.entries(search.data?.relaxed ?? {}) as [SearchFilter, number][]) {
      if (!best || count > best.count) best = { key, count }
    }
    return best
  }, [search.data])

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="flex-1 flex min-w-0">
      <aside
        aria-label="Search filters"
        className={clsx(
          'w-[240px] shrink-0 border-r border-(--color-border-default) p-4 flex-col gap-5 overflow-y-auto bg-(--color-bg-app)',
          filtersOpen ? 'flex fixed inset-y-12 left-0 z-(--z-panel) md:static' : 'hidden md:flex',
        )}
      >
        <FilterGroup label="Space">
          <FilterOption label="All spaces" active={!filters.space} onClick={() => set('space', null)} />
          {spaces
            .filter((s) => !s.archived)
            .map((s) => (
              <FilterOption key={s.id} label={s.name} active={filters.space === s.id} onClick={() => set('space', s.id)} />
            ))}
        </FilterGroup>
        <FilterGroup label="Type">
          <FilterOption label="Any type" active={!filters.type} onClick={() => set('type', null)} />
          <FilterOption label="Page" active={filters.type === 'page'} onClick={() => set('type', 'page')} />
          <FilterOption label="Blog post" active={filters.type === 'blog'} onClick={() => set('type', 'blog')} />
        </FilterGroup>
        <FilterGroup label="Contributor">
          <FilterOption label="Anyone" active={!filters.contributor} onClick={() => set('contributor', null)} />
          {users.map((u) => (
            <FilterOption key={u.id} label={u.name} active={filters.contributor === u.id} onClick={() => set('contributor', u.id)} />
          ))}
        </FilterGroup>
        <FilterGroup label="Last modified">
          <FilterOption label="Any time" active={!filters.modified} onClick={() => set('modified', null)} />
          {MODIFIED_OPTIONS.map((o) => (
            <FilterOption key={o.id} label={o.label} active={filters.modified === o.id} onClick={() => set('modified', o.id)} />
          ))}
        </FilterGroup>
        <FilterGroup label="Labels">
          <FilterOption label="Any label" active={!filters.label} onClick={() => set('label', null)} />
          {labels.map((l) => (
            <FilterOption key={l} label={l} active={filters.label === l} onClick={() => set('label', l)} />
          ))}
        </FilterGroup>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="grow flex items-center gap-2 h-10 px-3 rounded-(--radius-sm) border border-(--color-border-strong)">
              <Search className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  const next = new URLSearchParams(params)
                  if (e.target.value) next.set('q', e.target.value)
                  else next.delete('q')
                  setParams(next, { replace: true })
                }}
                placeholder="Search this site"
                aria-label="Search this site"
                className="t-ui-md grow bg-transparent outline-none"
              />
            </div>
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className="md:hidden h-10 px-3 rounded-(--radius-sm) border border-(--color-border-strong) inline-flex items-center gap-1.5 t-ui-md"
            >
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.5} /> Filters
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <p className="t-ui-sm text-(--color-text-secondary)" aria-live="polite">
              {search.isPending ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-1">
              {(['relevance', 'modified'] as Sort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  aria-pressed={sort === s}
                  className={clsx(
                    't-ui-sm-medium h-7 px-2 rounded-(--radius-sm)',
                    sort === s ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
                  )}
                >
                  {s === 'relevance' ? 'Relevance' : 'Last modified'}
                </button>
              ))}
            </div>
          </div>

          {search.isError ? (
            <div role="alert" className="text-center py-16">
              <p className="t-ui-md text-(--status-danger-text) mb-2">Search isn’t working right now: {search.error.message}</p>
              <button className="text-(--color-text-link) underline t-ui-md" onClick={() => void search.refetch()}>
                Try again
              </button>
            </div>
          ) : search.isPending ? null : results.length === 0 ? (
            <div className="text-center py-16">
              <p className="t-ui-md text-(--color-text-secondary) mb-1">{query ? <>No results for &ldquo;{query}&rdquo;.</> : 'No results.'}</p>
              {mostRestrictive && (
                <p className="t-ui-sm text-(--color-text-secondary)">
                  Try removing the <strong>{filterNames[mostRestrictive.key](filters[mostRestrictive.key]!)}</strong> filter
                  {mostRestrictive.count > 0 && ` (${mostRestrictive.count} result${mostRestrictive.count === 1 ? '' : 's'})`}.{' '}
                  <button className="text-(--color-text-link) underline" onClick={() => set(mostRestrictive.key, null)}>
                    Remove it
                  </button>
                </p>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-5">
              {results.map((p) => {
                const modifier = userById(p.updatedById)
                return (
                  <li key={p.id}>
                    <button onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}`)} className="text-left w-full">
                      <span className="t-ui-md-medium text-(--color-text-link) block">{highlight(p.title, query.trim())}</span>
                      <span className="t-ui-md text-(--color-text-secondary) line-clamp-2 block">
                        <Snippet parts={p.snippet} />
                      </span>
                    </button>
                    <p className="t-ui-sm text-(--color-text-secondary) mt-0.5">
                      {p.spaceName}
                      {' · '}
                      {modifier.name} · {relativeTime(p.updatedAt)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="t-ui-sm-medium text-(--color-text-secondary) mb-1.5">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function FilterOption({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        't-ui-md text-left h-7 px-2 rounded-(--radius-sm) truncate',
        active ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-primary) hover:bg-(--color-bg-hover)',
      )}
    >
      {label}
    </button>
  )
}
