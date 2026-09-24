import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronRight, FileText, Lock, MoreHorizontal, Plus } from 'lucide-react'
import type { PageTreeNode } from '../../types'
import { Menu } from '../ui/Menu'
import { CreatePageModal } from '../create/CreatePageModal'
import { usePageActions } from '../page/usePageActions'
import { useCreatePage } from '../../queries/pages'
import { useUIStore } from '../../store/uiStore'

export function PageTreeItem({
  node,
  parentId,
  spaceId,
  depth,
  activePageId,
  ancestorIds,
  posInSet,
  setSize,
}: {
  node: PageTreeNode
  parentId: string | null
  spaceId: string
  depth: number
  activePageId?: string
  ancestorIds: Set<string>
  posInSet: number
  setSize: number
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(ancestorIds.has(node.id) || depth === 0)
  const [createOpen, setCreateOpen] = useState(false)
  const actions = usePageActions({ id: node.id, spaceId, parentId, title: node.title })
  const createPage = useCreatePage()
  const pushToast = useUIStore((s) => s.pushToast)
  const hasChildren = node.children.length > 0
  const isActive = node.id === activePageId
  const isDraft = node.state === 'draft'
  const visualDepth = Math.min(depth, 8)

  return (
    <div>
      <div
        role="treeitem"
        data-id={node.id}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth + 1}
        aria-posinset={posInSet}
        aria-setsize={setSize}
        aria-selected={isActive}
        aria-label={node.title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/spaces/${spaceId}/pages/${node.id}`)
        }}
        className={clsx(
          'group flex items-center h-[var(--tree-row-height)] rounded-(--radius-sm) cursor-pointer relative t-ui-md',
          isActive ? 'bg-(--color-bg-selected) font-medium' : 'hover:bg-(--color-bg-hover)',
        )}
        style={{ paddingLeft: 8 + visualDepth * 16 }}
        onClick={() => navigate(`/spaces/${spaceId}/pages/${node.id}`)}
      >
        {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-(--color-bg-accent) rounded-(--radius-sm)" />}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className={clsx(
            'w-4 h-4 shrink-0 flex items-center justify-center mr-1 text-(--color-text-secondary)',
            !hasChildren && 'invisible',
          )}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          tabIndex={-1}
        >
          <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')} strokeWidth={1.75} />
        </button>
        <span className="w-4 h-4 shrink-0 flex items-center justify-center mr-1.5 text-(--color-text-secondary)">
          {node.icon ?? <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </span>
        <span className={clsx('truncate grow', isDraft && 'italic text-(--color-text-secondary)')}>{node.title}</span>
        {node.state === 'published-unpublished-changes' && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0 ml-1 bg-(--status-warning-bold)" role="img" aria-label="Unpublished changes" />
        )}
        {node.restricted && <Lock className="w-3 h-3 shrink-0 ml-1 text-(--color-text-secondary)" strokeWidth={1.5} />}

        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1 mr-1">
          <button
            onClick={(e) => {
              // Quick path (design.md §8.4): a blank child draft, no modal.
              e.stopPropagation()
              createPage.mutate(
                { spaceKey: spaceId, parentId: node.id },
                {
                  onSuccess: (page) => navigate(`/spaces/${page.spaceId}/pages/${page.id}/edit`),
                  onError: (err) => pushToast({ message: `Couldn’t create a page: ${err.message}`, tone: 'danger' }),
                },
              )
            }}
            className="w-5 h-5 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover)"
            aria-label="Add child page"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
          <Menu
            trigger={
              <button
                onClick={(e) => e.stopPropagation()}
                className="w-5 h-5 flex items-center justify-center rounded-(--radius-sm) hover:bg-(--color-bg-hover)"
                aria-label="Page actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            }
            items={[{ label: 'New child page', onSelect: () => setCreateOpen(true) }, ...actions.items]}
          />
        </span>
      </div>
      {expanded && hasChildren && (
        <div role="group">
          {node.children.map((child, i) => (
            <PageTreeItem
              key={child.id}
              posInSet={i + 1}
              setSize={node.children.length}
              node={child}
              parentId={node.id}
              spaceId={spaceId}
              depth={depth + 1}
              activePageId={activePageId}
              ancestorIds={ancestorIds}
            />
          ))}
        </div>
      )}
      {actions.dialogs}
      <CreatePageModal open={createOpen} onClose={() => setCreateOpen(false)} defaultSpaceId={spaceId} defaultParentId={node.id} />
    </div>
  )
}
