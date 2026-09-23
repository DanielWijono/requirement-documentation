import { createPortal } from 'react-dom'
import { ArrowLeft, RotateCcw, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import type { Page } from '../../types'
import { userById } from '../../data/mockData'
import { useEscapeKey } from '../../hooks/useClickOutside'
import { useContentStore } from '../../store/contentStore'
import { useUIStore } from '../../store/uiStore'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'

function DiffPane() {
  return (
    <div className="prose max-w-none">
      <p>
        We need a durable transport for payment lifecycle events between the ledger service and its{' '}
        <span className="bg-(--status-danger-subtle) line-through decoration-2 rounded-(--radius-sm) px-0.5">
          <span aria-hidden className="text-(--status-danger-bold) not-italic mr-1">−</span>
          six
        </span>{' '}
        <span className="bg-(--status-success-subtle) underline decoration-2 rounded-(--radius-sm) px-0.5">
          <span aria-hidden className="text-(--status-success-bold) not-italic mr-1">+</span>
          nine
        </span>{' '}
        downstream consumers.
      </p>
      <p>
        We will introduce a managed queue in front of every consumer. Producers publish once;{' '}
        <span className="bg-(--status-success-subtle) underline decoration-2 rounded-(--radius-sm) px-0.5">
          <span aria-hidden className="text-(--status-success-bold) not-italic mr-1">+</span>
          events are retried up to 5 times per consumer with exponential backoff before landing in a dead-letter queue.
        </span>
      </p>
    </div>
  )
}

export function VersionCompareModal({
  page,
  version,
  onClose,
}: {
  page: Page
  version: number | null
  onClose: () => void
}) {
  useEscapeKey(onClose, version !== null)
  const restoreVersion = useContentStore((s) => s.restoreVersion)
  const pushToast = useUIStore((s) => s.pushToast)
  const [confirmRestore, setConfirmRestore] = useState(false)

  if (version === null) return null
  const v = page.versions.find((x) => x.version === version)
  if (!v) return null
  const author = userById(v.authorId)

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) bg-(--color-bg-app) flex flex-col">
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-(--color-border-default) bg-(--color-bg-canvas)">
        <Button variant="subtle" iconOnly icon={<ArrowLeft strokeWidth={1.5} />} onClick={onClose} aria-label="Back" />
        <Avatar user={author} size={24} />
        <div className="t-ui-md">
          <span className="font-medium">Version {v.version}</span>
          <span className="text-(--color-text-secondary)"> · {author.name} · {v.relativeTime}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="default" size="compact" icon={<LinkIcon strokeWidth={1.5} />}>
            Copy link
          </Button>
          {!v.current && (
            <Button variant="primary" size="compact" icon={<RotateCcw strokeWidth={1.5} />} onClick={() => setConfirmRestore(true)}>
              Restore this version
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-8 px-6">
        <div className="max-w-[960px] mx-auto">
          <p className="t-ui-sm text-(--color-text-secondary) mb-4">
            Illustrative diff. Additions are underlined on a success background; removals are struck through on a
            danger background. A gutter glyph repeats the signal so it never relies on colour alone.
          </p>
          <h1 className="t-content-title mb-2">{page.title}</h1>
          <DiffPane />
        </div>
      </div>

      <Modal
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        title="Restore this version?"
        width="confirm"
        initialFocusDangerous
        footer={
          <>
            <Button variant="default" data-cancel onClick={() => setConfirmRestore(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                restoreVersion(page.id, v.version)
                setConfirmRestore(false)
                onClose()
                pushToast({ message: `Restored version ${v.version}`, tone: 'success' })
              }}
            >
              Restore
            </Button>
          </>
        }
      >
        <p className="t-ui-md">
          This creates a new version with the content from version {v.version}. The current version is kept in
          history and nothing is lost.
        </p>
      </Modal>
    </div>,
    document.body,
  )
}
