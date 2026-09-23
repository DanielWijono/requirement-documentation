import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, HelpCircle, Menu as MenuIcon, Plus, Search } from 'lucide-react'
import { Menu } from '../ui/Menu'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { Tooltip } from '../ui/Tooltip'
import { CounterBadge } from '../ui/Lozenge'
import { useUIStore } from '../../store/uiStore'
import { currentUser } from '../../data/mockData'
import { isVisiblePage, useContentStore } from '../../store/contentStore'
import { ShortcutsModal } from './ShortcutsModal'
import { useEffect, useState } from 'react'

export function TopBar() {
  const navigate = useNavigate()
  const toggleNav = useUIStore((s) => s.toggleNav)
  const openCommandPalette = useUIStore((s) => s.openCommandPalette)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const density = useUIStore((s) => s.density)
  const setDensity = useUIStore((s) => s.setDensity)
  const readingFont = useUIStore((s) => s.readingFont)
  const setReadingFont = useUIStore((s) => s.setReadingFont)
  const openCreatePage = useUIStore((s) => s.openCreatePage)
  const pushToast = useUIStore((s) => s.pushToast)
  const resetToSeed = useContentStore((s) => s.resetToSeed)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === '?' && !(e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) {
        setShortcutsOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
  const spaces = useContentStore((s) => s.spaces)
  const pages = useContentStore((s) => s.pages)
  const recentlyViewed = useContentStore((s) => s.recentlyViewed)
  const starredPages = Object.values(pages).filter((p) => p.starred && isVisiblePage(p))

  return (
    <header className="h-12 shrink-0 flex items-center gap-1 px-3 border-b border-(--color-border-default) bg-(--color-bg-canvas) z-(--z-nav)">
      <Tooltip label="Toggle space navigation" shortcut="[">
        <Button variant="subtle" iconOnly icon={<MenuIcon strokeWidth={1.5} />} onClick={toggleNav} aria-label="Toggle navigation" />
      </Tooltip>

      <button
        onClick={() => navigate('/')}
        className="t-ui-lg flex items-center gap-1.5 px-2 shrink-0"
        aria-label="Quire home"
      >
        <span
          aria-hidden
          className="w-5 h-5 rounded-(--radius-sm) inline-block"
          style={{ background: 'var(--color-bg-accent)' }}
        />
        Quire
      </button>

      <nav className="hidden sm:flex items-center gap-0.5 ml-1">
        <Menu
          trigger={
            <Button variant="subtle" size="compact" className="text-(--color-text-secondary)">
              Spaces <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          }
          items={[
            ...spaces
              .filter((s) => !s.archived)
              .map((s) => ({ label: `${s.icon} ${s.name}`, onSelect: () => navigate(`/spaces/${s.id}`) })),
            { label: '', divider: true },
            { label: 'Browse all spaces', onSelect: () => navigate('/spaces') },
          ]}
        />
        <Menu
          trigger={
            <Button variant="subtle" size="compact" className="text-(--color-text-secondary)">
              Recent <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          }
          items={recentlyViewed.filter((r) => isVisiblePage(pages[r.pageId])).map((r) => {
            const page = pages[r.pageId]
            return {
              label: page?.title ?? r.pageId,
              onSelect: () => navigate(`/spaces/${r.spaceId}/pages/${r.pageId}`),
            }
          })}
        />
        <Menu
          trigger={
            <Button variant="subtle" size="compact" className="text-(--color-text-secondary)">
              Starred <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          }
          items={
            starredPages.length
              ? starredPages.map((page) => ({
                  label: page.title,
                  onSelect: () => navigate(`/spaces/${page.spaceId}/pages/${page.id}`),
                }))
              : [{ label: 'No starred pages yet', disabled: true }]
          }
        />
      </nav>

      <button
        onClick={openCommandPalette}
        className="t-ui-md flex-1 max-w-[480px] mx-auto hidden sm:flex items-center gap-2 h-8 px-3 rounded-(--radius-sm) border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong)"
      >
        <Search className="w-4 h-4" strokeWidth={1.5} />
        Search
        <span className="ml-auto t-ui-sm">⌘K</span>
      </button>
      <Button
        variant="subtle"
        iconOnly
        className="sm:hidden ml-auto"
        icon={<Search strokeWidth={1.5} />}
        onClick={openCommandPalette}
        aria-label="Search"
      />

      <div className="flex items-center gap-1 ml-auto sm:ml-2 shrink-0">
        <Button variant="primary" size="compact" icon={<Plus strokeWidth={1.75} />} className="hidden sm:inline-flex" onClick={openCreatePage}>
          Create
        </Button>
        <Button variant="primary" iconOnly size="compact" className="sm:hidden" icon={<Plus strokeWidth={1.75} />} onClick={openCreatePage} aria-label="Create" />

        <Tooltip label="Notifications">
          <span className="relative inline-flex">
            <Button variant="subtle" iconOnly icon={<Bell strokeWidth={1.5} />} aria-label="Notifications" />
            <span className="absolute top-1 right-1 pointer-events-none">
              <CounterBadge count={3} />
            </span>
          </span>
        </Tooltip>
        <Tooltip label="Shortcut reference" shortcut="?">
          <Button
            variant="subtle"
            iconOnly
            icon={<HelpCircle strokeWidth={1.5} />}
            aria-label="Help"
            className="hidden sm:inline-flex"
            onClick={() => setShortcutsOpen(true)}
          />
        </Tooltip>
        <Menu
          align="end"
          trigger={
            <button aria-label="Account menu">
              <Avatar user={currentUser} size={32} />
            </button>
          }
          items={[
            { label: 'Your profile' },
            { label: '', divider: true },
            { label: `Theme: ${theme}`, onSelect: () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light') },
            { label: `Density: ${density === 'comfortable' ? 'Comfortable' : 'Compact'}`, onSelect: () => setDensity(density === 'comfortable' ? 'compact' : 'comfortable') },
            { label: `Reading font: ${readingFont === 'serif' ? 'Serif' : 'Sans'}`, onSelect: () => setReadingFont(readingFont === 'serif' ? 'sans' : 'serif') },
            { label: '', divider: true },
            { label: 'Settings' },
            ...(import.meta.env.DEV
              ? [
                  {
                    label: 'Reset demo data',
                    destructive: true,
                    onSelect: () => {
                      resetToSeed()
                      navigate('/')
                      pushToast({ message: 'Demo data reset', tone: 'info' })
                    },
                  },
                ]
              : []),
            { label: 'Log out' },
          ]}
        />
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </header>
  )
}
