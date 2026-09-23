import { useNavigate, useParams } from 'react-router-dom'
import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import clsx from 'clsx'
import { Archive, ChevronLeft, FilePlus2, Home, MoreHorizontal, Plus, Settings, SquarePen, LayoutTemplate } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { usePageTree, useSpace, ancestorChainIn } from '../../store/contentStore'
import { PageTreeItem } from './PageTreeItem'
import { CreatePageModal } from '../create/CreatePageModal'
import { useMediaQuery } from '../../hooks/useMediaQuery'

export function SpaceNav() {
  const { spaceId, pageId } = useParams()
  const navigate = useNavigate()
  const space = useSpace(spaceId)
  const tree = usePageTree(spaceId)
  const navCollapsed = useUIStore((s) => s.navCollapsed)
  const toggleNav = useUIStore((s) => s.toggleNav)
  const navWidth = useUIStore((s) => s.navWidth)
  const setNavWidth = useUIStore((s) => s.setNavWidth)
  const [createOpen, setCreateOpen] = useState(false)
  const dragging = useRef(false)
  // Below `md` the tree becomes a drawer (design.md §3.4) instead of a docked, resizable rail.
  const isDrawer = useMediaQuery('(max-width: 959px)')

  const ancestorIds = useMemo(() => {
    if (!pageId || !spaceId) return new Set<string>()
    return new Set(ancestorChainIn(tree, pageId).map((n) => n.id))
  }, [tree, pageId, spaceId])

  if (!space) return null

  if (navCollapsed) {
    if (isDrawer) return null
    return (
      <div className="w-10 shrink-0 border-r border-(--color-border-default) bg-(--color-bg-nav) flex flex-col items-center py-2">
        <button
          onClick={toggleNav}
          className="w-8 h-8 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover) text-(--color-text-secondary)"
          aria-label="Expand navigation"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  function onDragStart(e: ReactPointerEvent) {
    dragging.current = true
    const startX = e.clientX
    const startWidth = navWidth
    function onMove(ev: PointerEvent) {
      if (!dragging.current) return
      setNavWidth(startWidth + (ev.clientX - startX))
    }
    function onUp() {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <>
      {isDrawer && <div className="fixed top-12 inset-x-0 bottom-0 z-(--z-nav) bg-black/30" onClick={toggleNav} aria-hidden />}
      <nav
      aria-label={space.name}
      className={clsx(
        'border-r border-(--color-border-default) bg-(--color-bg-nav) flex flex-col relative',
        isDrawer ? 'fixed top-12 bottom-0 left-0 z-(--z-nav)' : 'shrink-0',
      )}
      style={{ width: isDrawer ? Math.min(navWidth, 320) : navWidth }}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{space.icon}</span>
          <span className="t-ui-md-medium truncate grow">{space.name}</span>
          <button className="w-6 h-6 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover) text-(--color-text-secondary)" aria-label="Space actions">
            <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <p className="t-ui-sm text-(--color-text-secondary) mt-0.5">{space.key}</p>
      </div>

      <div className="px-2 pb-2 flex flex-col gap-0.5 border-b border-(--color-border-default)">
        <NavRow icon={<Home className="w-4 h-4" strokeWidth={1.5} />} label="Overview" onClick={() => navigate(`/spaces/${spaceId}`)} />
        <NavRow icon={<SquarePen className="w-4 h-4" strokeWidth={1.5} />} label="Blog" onClick={() => navigate(`/spaces/${spaceId}/blog`)} />
        <NavRow icon={<LayoutTemplate className="w-4 h-4" strokeWidth={1.5} />} label="Templates" onClick={() => navigate(`/spaces/${spaceId}/templates`)} />
        <NavRow icon={<Archive className="w-4 h-4" strokeWidth={1.5} />} label="Archived pages" onClick={() => navigate(`/spaces/${spaceId}/archive`)} />
        <NavRow icon={<Settings className="w-4 h-4" strokeWidth={1.5} />} label="Space settings" onClick={() => navigate(`/spaces/${spaceId}/settings`)} />
      </div>

      <div className="flex items-center px-3 pt-3 pb-1">
        <span className="t-ui-sm-medium text-(--color-text-secondary) grow">Content</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="w-5 h-5 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover) text-(--color-text-secondary)"
          aria-label="Add page"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div role="tree" className="flex-1 overflow-y-auto px-2 pb-2">
        {tree.length === 0 ? (
          <button
            onClick={() => setCreateOpen(true)}
            className="w-full flex flex-col items-center gap-2 mt-4 p-4 text-center rounded-(--radius-md) border border-dashed border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong)"
          >
            <FilePlus2 className="w-5 h-5" strokeWidth={1.5} />
            <span className="t-ui-sm">This space has no pages yet</span>
          </button>
        ) : (
          tree.map((node) => (
            <PageTreeItem key={node.id} node={node} spaceId={spaceId!} depth={0} activePageId={pageId} ancestorIds={ancestorIds} />
          ))
        )}
      </div>

      <button
        onClick={toggleNav}
        aria-label="Collapse navigation"
        className="t-ui-sm flex items-center gap-1.5 px-3 h-9 border-t border-(--color-border-default) text-(--color-text-secondary) hover:bg-(--color-bg-hover)"
      >
        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Collapse
      </button>

      {!isDrawer && (
        <div
          onPointerDown={onDragStart}
          onDoubleClick={() => setNavWidth(280)}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-(--color-border-focus)"
        />
      )}

      <CreatePageModal open={createOpen} onClose={() => setCreateOpen(false)} defaultSpaceId={spaceId!} />
      </nav>
    </>
  )
}

function NavRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx('t-ui-md flex items-center gap-2 h-7 px-2 rounded-(--radius-sm) text-left hover:bg-(--color-bg-hover)')}
    >
      <span className="text-(--color-text-secondary)">{icon}</span>
      {label}
    </button>
  )
}
