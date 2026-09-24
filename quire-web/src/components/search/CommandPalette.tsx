import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { FileText, Plus, Search, Sun, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { isVisiblePage, useContentStore } from '../../store/contentStore'
import { useEscapeKey } from '../../hooks/useClickOutside'
import { useReturnFocus } from '../../hooks/useReturnFocus'
import { useUserList } from '../../queries/users'
import { Avatar } from '../ui/Avatar'
import { useSpaceList } from '../../queries/spaces'

interface Result {
  id: string
  kind: 'page' | 'space' | 'person' | 'action'
  title: string
  subtitle?: string
  onSelect: () => void
}

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

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  // Mount only while open so query, scope and selection reset on every opening.
  return open ? <CommandPaletteBody /> : null
}

function CommandPaletteBody() {
  const close = useUIStore((s) => s.closeCommandPalette)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const openCreatePage = useUIStore((s) => s.openCreatePage)
  const navigate = useNavigate()
  const { spaceId } = useParams()
  const spaces = useSpaceList()
  const users = useUserList()
  const pages = useContentStore((s) => s.pages)
  const recentlyViewed = useContentStore((s) => s.recentlyViewed)

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(spaceId ?? null)
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  useEscapeKey(close)
  useReturnFocus()
  // Focus after useReturnFocus has recorded the opener (autoFocus would run first and hide it).
  useEffect(() => inputRef.current?.focus(), [])

  const scopeSpace = spaces.find((s) => s.id === scope)

  const results: Result[] = useMemo(() => {
    if (!query.trim()) {
      const recents: Result[] = recentlyViewed.filter((r) => isVisiblePage(pages[r.pageId])).slice(0, 5).map((r) => {
        const p = pages[r.pageId]
        return {
          id: `recent-${r.pageId}`,
          kind: 'page',
          title: p?.title ?? r.pageId,
          subtitle: spaces.find((s) => s.id === r.spaceId)?.name,
          onSelect: () => navigate(`/spaces/${r.spaceId}/pages/${r.pageId}`),
        }
      })
      const recentSpaces: Result[] = spaces.slice(0, 3).map((s) => ({
        id: `space-${s.id}`,
        kind: 'space',
        title: s.name,
        subtitle: s.key,
        onSelect: () => navigate(`/spaces/${s.id}`),
      }))
      const actions: Result[] = [
        { id: 'action-create', kind: 'action', title: 'Create page', onSelect: openCreatePage },
        { id: 'action-goto', kind: 'action', title: 'Go to space…', onSelect: () => navigate('/spaces') },
        {
          id: 'action-theme',
          kind: 'action',
          title: 'Toggle theme',
          onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
      ]
      return [...recents, ...recentSpaces, ...actions]
    }

    const q = query.toLowerCase()
    const pool = Object.values(pages).filter((p) => isVisiblePage(p) && (scope ? p.spaceId === scope : true))
    const pageResults: Result[] = pool
      .filter((p) => p.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({
        id: `p-${p.id}`,
        kind: 'page',
        title: p.title,
        subtitle: `${spaces.find((s) => s.id === p.spaceId)?.name} · ${p.updatedRelative}`,
        onSelect: () => navigate(`/spaces/${p.spaceId}/pages/${p.id}`),
      }))
    const spaceResults: Result[] = spaces
      .filter((s) => s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
      .map((s) => ({ id: `s-${s.id}`, kind: 'space', title: s.name, subtitle: s.key, onSelect: () => navigate(`/spaces/${s.id}`) }))
    const peopleResults: Result[] = users
      .filter((u) => u.name.toLowerCase().includes(q))
      .map((u) => ({ id: `u-${u.id}`, kind: 'person', title: u.name, onSelect: () => navigate(`/search?contributor=${u.id}`) }))
    return [...pageResults, ...spaceResults, ...peopleResults]
  }, [query, scope, pages, spaces, users, recentlyViewed, navigate, setTheme, theme, openCreatePage])

  function commit(index: number) {
    const r = results[index]
    if (!r) return
    r.onSelect()
    close()
  }

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-label="Command palette"
        style={{ width: 640, maxWidth: '100%', boxShadow: 'var(--elevation-3)' }}
        className="relative bg-(--color-bg-raised) rounded-(--radius-lg) overflow-hidden flex flex-col max-h-[70vh]"
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-(--color-border-default) shrink-0">
          <Search className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
          {scopeSpace && (
            <span className="t-ui-sm-medium flex items-center gap-1 px-2 h-6 rounded-(--radius-sm) bg-(--color-bg-selected) text-(--color-text-link) shrink-0">
              In {scopeSpace.key}
              <button onClick={() => setScope(null)} aria-label="Remove scope">
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && query === '' && scope) setScope(null)
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                commit(activeIndex)
              }
            }}
            placeholder="Search pages, spaces, people…"
            className="t-ui-md grow bg-transparent outline-none"
          />
        </div>
        <div className="overflow-y-auto py-1">
          {results.length === 0 && <p className="t-ui-md text-(--color-text-secondary) text-center py-8">No results. Try removing a filter.</p>}
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(i)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 h-11 text-left',
                i === activeIndex ? 'bg-(--color-bg-selected)' : 'hover:bg-(--color-bg-hover)',
              )}
            >
              <ResultIcon result={r} />
              <span className="min-w-0 grow">
                <span className="t-ui-md block truncate">{highlight(r.title, query)}</span>
                {r.subtitle && <span className="t-ui-sm text-(--color-text-secondary) block truncate">{r.subtitle}</span>}
              </span>
            </button>
          ))}
        </div>
        {query && (
          <button
            onClick={() => {
              navigate(`/search?q=${encodeURIComponent(query)}`)
              close()
            }}
            className="t-ui-sm-medium text-(--color-text-link) text-left px-4 h-9 border-t border-(--color-border-default) shrink-0"
          >
            See all results
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

function ResultIcon({ result }: { result: Result }) {
  const users = useUserList()
  if (result.kind === 'person') {
    const u = users.find((x) => x.name === result.title)
    return u ? <Avatar user={u} size={24} /> : <FileText className="w-4 h-4" strokeWidth={1.5} />
  }
  if (result.kind === 'action' && result.title === 'Toggle theme') {
    return <Sun className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
  }
  if (result.kind === 'action') return <Plus className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
  if (result.kind === 'space') return <span className="w-6 text-center">{result.subtitle ? '📁' : '📁'}</span>
  return <FileText className="w-4 h-4 text-(--color-text-secondary)" strokeWidth={1.5} />
}
