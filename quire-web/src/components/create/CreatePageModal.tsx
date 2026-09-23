import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { FileText, LayoutTemplate, MessagesSquare, Rows3 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useContentStore } from '../../store/contentStore'
import type { PageTreeNode } from '../../types'

interface Template {
  id: string
  name: string
  description: string
  icon: typeof FileText
  category: 'Recent' | 'Meetings' | 'Product' | 'People'
}

const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank page', description: 'Start with an empty canvas.', icon: FileText, category: 'Recent' },
  { id: 'meeting-notes', name: 'Meeting notes', description: 'Agenda, attendees, and action items.', icon: MessagesSquare, category: 'Meetings' },
  { id: 'prd', name: 'Product requirements', description: 'Problem, goals, scope, and success metrics.', icon: LayoutTemplate, category: 'Product' },
  { id: 'retro', name: 'Retrospective', description: 'What went well, what didn’t, action items.', icon: Rows3, category: 'Meetings' },
]

function flattenTree(nodes: PageTreeNode[], depth = 0): { id: string; title: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, title: n.title, depth }, ...flattenTree(n.children, depth + 1)])
}

export function CreatePageModal({
  open,
  onClose,
  defaultSpaceId,
  defaultParentId = null,
}: {
  open: boolean
  onClose: () => void
  defaultSpaceId: string
  defaultParentId?: string | null
}) {
  const navigate = useNavigate()
  const spaces = useContentStore((s) => s.spaces)
  const pageTree = useContentStore((s) => s.pageTree)
  const createPage = useContentStore((s) => s.createPage)

  const [spaceId, setSpaceId] = useState(defaultSpaceId)
  const [parentId, setParentId] = useState<string | null>(defaultParentId)
  const [templateId, setTemplateId] = useState('blank')

  useEffect(() => {
    if (open) {
      setSpaceId(defaultSpaceId)
      setParentId(defaultParentId)
      setTemplateId('blank')
    }
  }, [open, defaultSpaceId, defaultParentId])

  const flatPages = useMemo(() => flattenTree(pageTree[spaceId] ?? []), [pageTree, spaceId])
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]

  function handleCreate() {
    const id = createPage(spaceId, parentId, template.id === 'blank' ? 'Untitled' : template.name)
    onClose()
    navigate(`/spaces/${spaceId}/pages/${id}/edit`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create"
      width="picker"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} data-autofocus>
            Create
          </Button>
        </>
      }
    >
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: '220px 1fr' }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreate()
        }}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="t-ui-md-medium block mb-1.5">Space</label>
            <select
              value={spaceId}
              onChange={(e) => {
                setSpaceId(e.target.value)
                setParentId(null)
              }}
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            >
              {spaces
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="t-ui-md-medium block mb-1.5">Parent page</label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            >
              <option value="">Space root</option>
              {flatPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {'  '.repeat(p.depth)}
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon
              const active = t.id === templateId
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={clsx(
                    't-ui-md flex flex-col gap-2 w-[140px] p-3 rounded-(--radius-md) border text-left transition-colors',
                    active
                      ? 'border-(--color-border-focus) bg-(--color-bg-selected)'
                      : 'border-(--color-border-default) hover:border-(--color-border-strong)',
                  )}
                >
                  <Icon className="w-5 h-5 text-(--color-text-secondary)" strokeWidth={1.5} />
                  <span className="t-ui-md-medium">{t.name}</span>
                </button>
              )
            })}
          </div>
          <div className="rounded-(--radius-md) border border-(--color-border-default) p-4 bg-(--color-bg-sunken)">
            <p className="t-ui-md-medium mb-1">{template.name}</p>
            <p className="t-ui-md text-(--color-text-secondary)">{template.description}</p>
          </div>
          <p className="t-ui-sm text-(--color-text-secondary) mt-3">Press {'⌘'} Enter to create immediately.</p>
        </div>
      </div>
    </Modal>
  )
}
