import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { TopBar } from './TopBar'
import { SpaceNav } from '../nav/SpaceNav'
import { ToastHost } from '../ui/ToastHost'
import { CommandPalette } from '../search/CommandPalette'
import { CreatePageModal } from '../create/CreatePageModal'
import { useUIStore } from '../../store/uiStore'
import { usePage } from '../../queries/pages'
import { useSpaceList } from '../../queries/spaces'

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function AppShell() {
  const { spaceId, pageId } = useParams()
  const openCommandPalette = useUIStore((s) => s.openCommandPalette)
  const toggleNav = useUIStore((s) => s.toggleNav)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const openCreatePage = useUIStore((s) => s.openCreatePage)
  const closeCreatePage = useUIStore((s) => s.closeCreatePage)
  const createOpen = useUIStore((s) => s.createPageOpen)
  const spaces = useSpaceList()
  // New pages default to the current page's parent context, i.e. a sibling of what you are reading.
  const currentParentId = usePage(pageId)?.parentId ?? null

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Shortcuts the focused widget already handled (e.g. ⌘K inside the editor) win over global ones.
      if (e.defaultPrevented) return
      const typing = isTypingTarget(e.target)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openCommandPalette()
        return
      }
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        openCommandPalette()
      } else if (e.key === '[') {
        toggleNav()
      } else if (e.key === ']') {
        toggleRightPanel()
      } else if (e.key.toLowerCase() === 'c') {
        openCreatePage()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openCommandPalette, toggleNav, toggleRightPanel, openCreatePage])

  return (
    <div className="h-screen flex flex-col bg-(--color-bg-app)">
      <nav aria-label="Skip links" className="contents">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {spaceId && (
          <a href="#page-tree" className="skip-link">
            Skip to page tree
          </a>
        )}
      </nav>
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {spaceId && <SpaceNav />}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 min-h-0 flex outline-none">
          <Outlet />
        </main>
      </div>
      <ToastHost />
      <CommandPalette />
      <CreatePageModal open={createOpen} onClose={closeCreatePage} defaultSpaceId={spaceId ?? spaces[0]?.id ?? 'sp.eng'} defaultParentId={currentParentId} />
    </div>
  )
}
