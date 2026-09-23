import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MenuItemSpec } from '../ui/Menu'
import { ConfirmModal } from '../ui/ConfirmModal'
import { MovePageModal } from './MovePageModal'
import { useContentStore } from '../../store/contentStore'
import { useUIStore } from '../../store/uiStore'
import type { Page } from '../../types'

export function pageUrl(page: Pick<Page, 'id' | 'spaceId'>) {
  return `${window.location.origin}/spaces/${page.spaceId}/pages/${page.id}`
}

/**
 * Page-level actions shared by the page header and the page tree menus.
 * Returns the menu items plus the dialogs they open; render `dialogs` next to the menu.
 */
export function usePageActions(page: Page | undefined) {
  const navigate = useNavigate()
  const copyPage = useContentStore((s) => s.copyPage)
  const archivePage = useContentStore((s) => s.archivePage)
  const restorePage = useContentStore((s) => s.restorePage)
  const deletePage = useContentStore((s) => s.deletePage)
  const pushToast = useUIStore((s) => s.pushToast)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!page) return { copyLink: () => {}, items: [] as MenuItemSpec[], dialogs: null }

  function copyLink() {
    if (!page) return
    void navigator.clipboard?.writeText(pageUrl(page))
    pushToast({ message: 'Link copied', tone: 'success' })
  }

  const items: MenuItemSpec[] = [
    { label: 'Copy link', onSelect: copyLink },
    { label: 'Move…', onSelect: () => setMoveOpen(true) },
    {
      label: 'Copy…',
      onSelect: () => {
        const id = copyPage(page.id)
        if (!id) return
        pushToast({ message: `Created “Copy of ${page.title}”`, tone: 'success' })
        navigate(`/spaces/${page.spaceId}/pages/${id}/edit`)
      },
    },
    { label: '', divider: true },
    {
      label: 'Archive',
      destructive: true,
      onSelect: () => {
        archivePage(page.id)
        pushToast({ message: `Archived “${page.title}”`, tone: 'info', actionLabel: 'Undo', onAction: () => restorePage(page.id) })
      },
    },
    { label: 'Delete', destructive: true, onSelect: () => setDeleteOpen(true) },
  ]

  const dialogs = (
    <>
      <MovePageModal page={page} open={moveOpen} onClose={() => setMoveOpen(false)} />
      <ConfirmModal
        open={deleteOpen}
        title="Delete this page?"
        confirmLabel="Delete"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          deletePage(page.id)
          pushToast({ message: `Deleted “${page.title}”`, tone: 'info', actionLabel: 'Undo', onAction: () => restorePage(page.id) })
        }}
      >
        “{page.title}” and its child pages move to Trash. A space admin can restore them.
      </ConfirmModal>
    </>
  )

  return { copyLink, items, dialogs }
}
