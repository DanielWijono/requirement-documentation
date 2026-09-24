import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useContentStore, ancestorChainIn, isVisiblePage } from '../store/contentStore'
import { useUserList, useUserLookup } from '../queries/users'
import { ageInDays } from '../lib/relativeTime'
import type { Page } from '../types'
import { useSpaceList } from '../queries/spaces'

type Sort = 'relevance' | 'modified'
type TypeFilter = 'page' | 'blog'
type ModifiedFilter = 'today' | 'week' | 'month'

const MODIFIED_OPTIONS: { id: ModifiedFilter; label: string; maxDays: number }[] = [
  { id: 'today', label: 'Today', maxDays: 0 },
  { id: 'week', label: 'Past 7 days', maxDays: 7 },
  { id: 'month', label: 'Past 30 days', maxDays: 30 },
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

/** What readers see: the published body when there is one. */
function bodyText(p: Page) {
  return (p.publishedHtml ?? p.contentHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Up to 160 characters of body text around the first match. */
function snippet(text: string, query: string) {
  const idx = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (idx < 0) return text.slice(0, 160)
  const start = Math.max(0, idx - 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 160)}${start + 160 < text.length ? '…' : ''}`
}

function relevance(p: Page, q: string) {
  if (!q) return 0
  const title = p.title.toLowerCase()
  const body = bodyText(p).toLowerCase()
  let score = 0
  if (title === q) score += 20
  else if (title.startsWith(q)) score += 12
  else if (title.includes(q)) score += 8
  score += Math.min(body.split(q).length - 1, 5)
  return score
}

function applyFilters(pages: Page[], q: string, f: Filters) {
  return pages.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q) && !bodyText(p).toLowerCase().includes(q)) return false
    if (f.space && p.spaceId !== f.space) return false
    if (f.type && (f.type === 'blog') !== Boolean(p.isBlogPost)) return false
    if (f.contributor && p.updatedById !== f.contributor && p.ownerId !== f.contributor) return false
    if (f.modified && ageInDays(p.updatedRelative) > MODIFIED_OPTIONS.find((o) => o.id === f.modified)!.maxDays) return false
    if (f.label && !p.labels.some((l) => l.name === f.label)) return false
    return true
  })
}

export function SearchResults() {
  const userById = useUserLookup()
  const users = useUserList()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const spaces = useSpaceList()
  const pages = useContentStore((s) => s.pages)
  const pageTree = useContentStore((s) => s.pageTree)

  const query = params.get('q') ?? ''
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, contributor: params.get('contributor'), label: params.get('label') })
  const [sort, setSort] = useState<Sort>('relevance')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const visiblePages = useMemo(() => Object.values(pages).filter(isVisiblePage), [pages])
  const labels = useMemo(() => [...new Set(visiblePages.flatMap((p) => p.labels.map((l) => l.name)))].sort(), [visiblePages])
  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    const list = applyFilters(visiblePages, q, filters)
    return [...list].sort((a, b) =>
      sort === 'modified' || !q ? ageInDays(a.updatedRelative) - ageInDays(b.updatedRelative) : relevance(b, q) - relevance(a, q),
    )
  }, [visiblePages, q, filters, sort])

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
    for (const key of Object.keys(filters) as (keyof Filters)[]) {
      if (!filters[key]) continue
      const count = applyFilters(visiblePages, q, { ...filters, [key]: null }).length
      if (!best || count > best.count) best = { key, count }
    }
    return best
  }, [filters, visiblePages, q])

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
              {results.length} result{results.length === 1 ? '' : 's'}
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

          {results.length === 0 ? (
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
                const space = spaces.find((s) => s.id === p.spaceId)
                const chain = ancestorChainIn(pageTree[p.spaceId] ?? [], p.id).slice(0, -1)
                const modifier = userById(p.updatedById)
                return (
                  <li key={p.id}>
                    <button onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}`)} className="text-left w-full">
                      <span className="t-ui-md-medium text-(--color-text-link) block">{highlight(p.title, query.trim())}</span>
                      <span className="t-ui-md text-(--color-text-secondary) line-clamp-2 block">{highlight(snippet(bodyText(p), query.trim()), query.trim())}</span>
                    </button>
                    <p className="t-ui-sm text-(--color-text-secondary) mt-0.5">
                      {space?.name}
                      {chain.length > 0 && ` / ${chain.map((c) => c.title).join(' / ')}`}
                      {' · '}
                      {modifier.name} · {p.updatedRelative}
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
