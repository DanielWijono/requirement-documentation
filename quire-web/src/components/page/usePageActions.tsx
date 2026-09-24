import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MenuItemSpec } from '../ui/Menu'
import { ConfirmModal } from '../ui/ConfirmModal'
import { MovePageModal } from './MovePageModal'
import { useCopyPage, useTrashAction } from '../../queries/pages'
import { useUIStore } from '../../store/uiStore'
import type { Page } from '../../types'

export function pageUrl(page: Pick<Page, 'id' | 'spaceId'>) {
  return `${window.location.origin}/spaces/${page.spaceId}/pages/${page.id}`
}

/** What the actions need to know about a page: tree rows only have this much. */
export type PageRef = Pick<Page, 'id' | 'spaceId' | 'parentId' | 'title'>

/**
 * Page-level actions shared by the page header and the page tree menus.
 * Returns the menu items plus the dialogs they open; render `dialogs` next to the menu.
 * The server decides what's allowed; a refusal shows as a toast.
 */
export function usePageActions(page: PageRef) {
  const navigate = useNavigate()
  const copyPage = useCopyPage()
  const trash = useTrashAction()
  const pushToast = useUIStore((s) => s.pushToast)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function copyLink() {
    void navigator.clipboard?.writeText(pageUrl(page))
    pushToast({ message: 'Link copied', tone: 'success' })
  }

  const failed = (what: string) => (err: Error) => pushToast({ message: `Couldn’t ${what}: ${err.message}`, tone: 'danger' })

  function restore() {
    trash.mutate({ pageId: page.id, action: 'restore' }, { onError: failed('restore the page') })
  }

  function trashPage(action: 'archive' | 'delete') {
    trash.mutate(
      { pageId: page.id, action },
      {
        onSuccess: () =>
          pushToast({ message: `${action === 'archive' ? 'Archived' : 'Deleted'} “${page.title}”`, tone: 'info', actionLabel: 'Undo', onAction: restore }),
        onError: failed(`${action} the page`),
      },
    )
  }

  const items: MenuItemSpec[] = [
    { label: 'Copy link', onSelect: copyLink },
    { label: 'Move…', onSelect: () => setMoveOpen(true) },
    {
      label: 'Copy…',
      onSelect: () =>
        copyPage.mutate(page.id, {
          onSuccess: (copy) => {
            pushToast({ message: `Created “${copy.title}”`, tone: 'success' })
            navigate(`/spaces/${copy.spaceId}/pages/${copy.id}/edit`)
          },
          onError: failed('copy the page'),
        }),
    },
    { label: '', divider: true },
    { label: 'Archive', destructive: true, onSelect: () => trashPage('archive') },
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
        onConfirm={() => trashPage('delete')}
      >
        “{page.title}” and its child pages move to Trash. A space admin can restore them.
      </ConfirmModal>
    </>
  )

  return { copyLink, items, dialogs }
}
