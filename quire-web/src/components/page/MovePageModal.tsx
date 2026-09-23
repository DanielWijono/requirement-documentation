import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { findTreeNodeIn, useContentStore, usePageTree } from '../../store/contentStore'
import { useUIStore } from '../../store/uiStore'
import type { Page, PageTreeNode } from '../../types'

function flatten(nodes: PageTreeNode[], excluded: string, depth = 0): { id: string; title: string; depth: number }[] {
  // Skip the page being moved and its whole subtree: it cannot become its own ancestor.
  return nodes
    .filter((n) => n.id !== excluded)
    .flatMap((n) => [{ id: n.id, title: n.title, depth }, ...flatten(n.children, excluded, depth + 1)])
}

export function MovePageModal({ page, open, onClose }: { page: Page; open: boolean; onClose: () => void }) {
  return open ? <MovePageModalBody page={page} onClose={onClose} /> : null
}

function MovePageModalBody({ page, onClose }: { page: Page; onClose: () => void }) {
  const tree = usePageTree(page.spaceId)
  const movePage = useContentStore((s) => s.movePage)
  const pushToast = useUIStore((s) => s.pushToast)
  const [parentId, setParentId] = useState<string | null>(page.parentId)
  const options = useMemo(() => flatten(tree, page.id), [tree, page.id])

  function handleMove() {
    if (movePage(page.id, parentId)) {
      const parentTitle = parentId ? findTreeNodeIn(tree, parentId)?.title : 'space root'
      pushToast({ message: `Moved to ${parentTitle}`, tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move “${page.title}”`}
      width="confirm"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleMove} disabled={parentId === page.parentId}>
            Move
          </Button>
        </>
      }
    >
      <label className="t-ui-md-medium block mb-1.5" htmlFor="move-parent">
        New parent
      </label>
      <select
        id="move-parent"
        value={parentId ?? ''}
        onChange={(e) => setParentId(e.target.value || null)}
        className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
      >
        <option value="">Space root</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {'  '.repeat(o.depth)}
            {o.title}
          </option>
        ))}
      </select>
    </Modal>
  )
}
