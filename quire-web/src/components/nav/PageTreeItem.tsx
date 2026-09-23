import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronRight, FileText, Lock, MoreHorizontal, Plus } from 'lucide-react'
import type { PageTreeNode } from '../../types'
import { Menu } from '../ui/Menu'
import { CreatePageModal } from '../create/CreatePageModal'

export function PageTreeItem({
  node,
  spaceId,
  depth,
  activePageId,
  ancestorIds,
}: {
  node: PageTreeNode
  spaceId: string
  depth: number
  activePageId?: string
  ancestorIds: Set<string>
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(ancestorIds.has(node.id) || depth === 0)
  const [createOpen, setCreateOpen] = useState(false)
  const hasChildren = node.children.length > 0
  const isActive = node.id === activePageId
  const isDraft = node.state === 'draft'
  const visualDepth = Math.min(depth, 8)

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth + 1}
        aria-selected={isActive}
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
        >
          <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')} strokeWidth={1.75} />
        </button>
        <span className="w-4 h-4 shrink-0 flex items-center justify-center mr-1.5 text-(--color-text-secondary)">
          {node.icon ?? <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </span>
        <span className={clsx('truncate grow', isDraft && 'italic text-(--color-text-secondary)')}>{node.title}</span>
        {node.restricted && <Lock className="w-3 h-3 shrink-0 ml-1 text-(--color-text-secondary)" strokeWidth={1.5} />}

        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1 mr-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCreateOpen(true)
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
            items={[
              { label: 'New child page', onSelect: () => setCreateOpen(true) },
              { label: 'Copy link' },
              { label: 'Move…' },
              { label: 'Copy…' },
              { label: '', divider: true },
              { label: 'Archive', destructive: true },
              { label: 'Delete', destructive: true },
            ]}
          />
        </span>
      </div>
      {expanded && hasChildren && (
        <div role="group">
          {node.children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              spaceId={spaceId}
              depth={depth + 1}
              activePageId={activePageId}
              ancestorIds={ancestorIds}
            />
          ))}
        </div>
      )}
      <CreatePageModal open={createOpen} onClose={() => setCreateOpen(false)} defaultSpaceId={spaceId} defaultParentId={node.id} />
    </div>
  )
}
