import { createPortal } from 'react-dom'
import { ArrowLeft, RotateCcw, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import type { Page, PageVersion } from '../../types'
import { useUserLookup } from '../../queries/users'
import { useEscapeKey } from '../../hooks/useClickOutside'
import { useReturnFocus } from '../../hooks/useReturnFocus'
import { useRestoreVersion, useVersionHtml } from '../../queries/pages'
import { useUIStore } from '../../store/uiStore'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'
import { diffHtml, hasChanges } from '../../lib/diff'
import type { DiffOp, DiffPart } from '../../lib/diff'
import { pageUrl } from '../page/usePageActions'

function Part({ part, show }: { part: DiffPart; show: DiffOp[] }) {
  if (!show.includes(part.op)) return null
  if (part.op === 'equal') return <>{part.text}</>
  const added = part.op === 'add'
  return (
    <span
      className={
        added
          ? 'bg-(--status-success-subtle) underline decoration-2 rounded-(--radius-sm) px-0.5'
          : 'bg-(--status-danger-subtle) line-through decoration-2 rounded-(--radius-sm) px-0.5'
      }
    >
      {/* The glyph repeats the signal so changes never rely on colour alone. */}
      <span aria-hidden className={added ? 'text-(--status-success-bold) mr-1' : 'text-(--status-danger-bold) mr-1'}>
        {added ? '+' : '−'}
      </span>
      <span className="sr-only">{added ? 'Added: ' : 'Removed: '}</span>
      {part.text}
    </span>
  )
}

function DiffPane({ paragraphs, show }: { paragraphs: DiffPart[][]; show: DiffOp[] }) {
  return (
    <div className="prose max-w-none">
      {paragraphs
        .filter((p) => p.some((part) => show.includes(part.op)))
        .map((p, i) => (
          <p key={i}>
            {p.map((part, k) => (
              <Part key={k} part={part} show={show} />
            ))}
          </p>
        ))}
    </div>
  )
}

export function VersionCompareModal({
  page,
  versions,
  version,
  onClose,
}: {
  page: Page
  versions: PageVersion[]
  version: number | null
  onClose: () => void
}) {
  const userById = useUserLookup()
  useEscapeKey(onClose, version !== null)
  useReturnFocus(version !== null)
  const restoreVersion = useRestoreVersion()
  const pushToast = useUIStore((s) => s.pushToast)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const v = version === null ? undefined : versions.find((x) => x.version === version)
  // Compare the selected version with what is live now; for the live version, with the one before it.
  const baseVersion = v ? (v.current ? versions.find((x) => x.version < v.version)?.version : v.version) : undefined
  const selectedHtml = useVersionHtml(page.id, v?.version)
  const baseHtml = useVersionHtml(page.id, baseVersion)

  if (!v) return null
  const author = userById(v.authorId)
  const loading = selectedHtml.isPending || (baseVersion !== undefined && baseHtml.isPending)
  const selected = selectedHtml.data ?? undefined
  const base = baseVersion !== undefined ? (baseHtml.data ?? undefined) : undefined
  const target = v.current ? selected : page.publishedHtml
  const comparedLabel = v.current ? (baseVersion !== undefined ? `Version ${baseVersion} → Version ${v.version}` : null) : `Version ${v.version} → current`
  const paragraphs = base !== undefined && target !== undefined ? diffHtml(base, target) : null

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) bg-(--color-bg-app) flex flex-col">
      <header className="min-h-12 py-2 shrink-0 flex flex-wrap items-center gap-3 px-4 border-b border-(--color-border-default) bg-(--color-bg-canvas)">
        <Button variant="subtle" iconOnly icon={<ArrowLeft strokeWidth={1.5} />} onClick={onClose} aria-label="Back" />
        <Avatar user={author} size={24} />
        <div className="t-ui-md">
          <span className="font-medium">Version {v.version}</span>
          <span className="text-(--color-text-secondary)"> · {author.name} · {v.relativeTime}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="default"
            size="compact"
            icon={<LinkIcon strokeWidth={1.5} />}
            onClick={() => {
              void navigator.clipboard?.writeText(`${pageUrl(page)}?version=${v.version}`)
              pushToast({ message: 'Link copied', tone: 'success' })
            }}
          >
            Copy link
          </Button>
          {!v.current && !loading && selected === undefined && (
            <span className="t-ui-sm text-(--color-text-secondary)">Content for this version isn’t available to restore</span>
          )}
          {!v.current && selected !== undefined && page.access?.edit && (
            <Button variant="primary" size="compact" icon={<RotateCcw strokeWidth={1.5} />} onClick={() => setConfirmRestore(true)}>
              Restore this version
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-8 px-6">
        <div className="max-w-[960px] mx-auto">
          <h1 className="t-content-title mb-2">{page.title}</h1>
          {loading ? (
            <p className="t-ui-md text-(--color-text-secondary)">Loading versions…</p>
          ) : paragraphs === null ? (
            <p className="t-ui-md text-(--color-text-secondary)">
              {selected === undefined ? 'Content for this version isn’t available, so it can’t be compared.' : 'There is no earlier version to compare with.'}
            </p>
          ) : !hasChanges(paragraphs) ? (
            <p className="t-ui-md text-(--color-text-secondary)">{comparedLabel}: no text changes.</p>
          ) : (
            <>
              <p className="t-ui-sm text-(--color-text-secondary) mb-4">
                {comparedLabel}. Additions are underlined with a + mark; removals are struck through with a − mark.
              </p>
              {/* Unified below lg, side by side at lg (design.md §8.6). */}
              <div className="lg:hidden" data-testid="diff-unified">
                <DiffPane paragraphs={paragraphs} show={['equal', 'add', 'remove']} />
              </div>
              <div className="hidden lg:grid grid-cols-2 gap-8" data-testid="diff-split">
                <div>
                  <p className="t-ui-sm-medium text-(--color-text-secondary) mb-2">Before</p>
                  <DiffPane paragraphs={paragraphs} show={['equal', 'remove']} />
                </div>
                <div>
                  <p className="t-ui-sm-medium text-(--color-text-secondary) mb-2">After</p>
                  <DiffPane paragraphs={paragraphs} show={['equal', 'add']} />
                </div>
              </div>
            </>
          )}
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
              loading={restoreVersion.isPending}
              onClick={() =>
                restoreVersion.mutate(
                  { page, version: v.version },
                  {
                    onSuccess: () => {
                      setConfirmRestore(false)
                      onClose()
                      pushToast({ message: `Restored version ${v.version}`, tone: 'success' })
                    },
                    onError: (err) => {
                      setConfirmRestore(false)
                      pushToast({ message: `Couldn’t restore version ${v.version}: ${err.message}`, tone: 'danger' })
                    },
                  },
                )
              }
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
