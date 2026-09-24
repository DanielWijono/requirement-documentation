import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { FileText, LayoutTemplate, MessagesSquare, Rows3 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useCreatePage, usePageTree } from '../../queries/pages'
import type { PageTreeNode } from '../../types'
import { TEMPLATES, templateOutline } from '../../data/templates'
import { useSpaceList } from '../../queries/spaces'

const ICONS: Record<string, typeof FileText> = {
  blank: FileText,
  'meeting-notes': MessagesSquare,
  prd: LayoutTemplate,
  retro: Rows3,
}

function flattenTree(nodes: PageTreeNode[], depth = 0): { id: string; title: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, title: n.title, depth }, ...flattenTree(n.children, depth + 1)])
}

interface CreatePageModalProps {
  open: boolean
  onClose: () => void
  defaultSpaceId: string
  defaultParentId?: string | null
}

export function CreatePageModal(props: CreatePageModalProps) {
  // Mount the body only while open so each opening starts from the defaults.
  return props.open ? <CreatePageModalBody {...props} /> : null
}

function CreatePageModalBody({ open, onClose, defaultSpaceId, defaultParentId = null }: CreatePageModalProps) {
  const navigate = useNavigate()
  const spaces = useSpaceList()
  const createPage = useCreatePage()

  const [spaceId, setSpaceId] = useState(defaultSpaceId)
  const [parentId, setParentId] = useState<string | null>(defaultParentId)
  const [templateId, setTemplateId] = useState('blank')

  const tree = usePageTree(spaceId)
  const flatPages = useMemo(() => flattenTree(tree), [tree])
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]

  function handleCreate(chosen = template) {
    if (createPage.isPending) return
    createPage.mutate(
      { spaceKey: spaceId, parentId, title: chosen.title, html: chosen.html },
      {
        onSuccess: (page) => {
          onClose()
          navigate(`/spaces/${page.spaceId}/pages/${page.id}/edit`)
        },
      },
    )
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
          <Button variant="primary" onClick={() => handleCreate()} data-autofocus loading={createPage.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div
        className="grid gap-6 md:grid-cols-[220px_1fr]"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreate(TEMPLATES[0])
        }}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="create-space" className="t-ui-md-medium block mb-1.5">Space</label>
            <select id="create-space"
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
            <label htmlFor="create-parent" className="t-ui-md-medium block mb-1.5">Parent page</label>
            <select id="create-parent"
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
              const Icon = ICONS[t.id] ?? FileText
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
          <div className="rounded-(--radius-md) border border-(--color-border-default) p-4 bg-(--color-bg-sunken)" aria-label="Template preview">
            <p className="t-ui-md-medium mb-1">{template.name}</p>
            <p className="t-ui-md text-(--color-text-secondary)">{template.description}</p>
            {templateOutline(template).length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {templateOutline(template).map((h) => (
                  <li key={h} className="t-ui-sm-medium flex items-center gap-2">
                    <span className="w-1 h-3 rounded-sm bg-(--color-border-strong)" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="t-ui-sm text-(--color-text-secondary) mt-3">Press {'⌘'} Enter to create a blank page immediately.</p>
        </div>
      </div>
      {createPage.isError && (
        <p role="alert" className="t-ui-sm text-(--status-danger-text) mt-3">
          Couldn’t create the page: {createPage.error.message}
        </p>
      )}
    </Modal>
  )
}
