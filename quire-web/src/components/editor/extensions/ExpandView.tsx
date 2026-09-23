import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

export function ExpandView({ node, updateAttributes }: NodeViewProps) {
  const open = Boolean(node.attrs.open)
  return (
    <NodeViewWrapper className="my-1 rounded-(--radius-sm) border border-(--color-border-default)">
      <div
        contentEditable={false}
        onClick={() => updateAttributes({ open: !open })}
        className="flex items-center gap-1.5 px-2 h-9 cursor-pointer select-none t-ui-md-medium"
      >
        <ChevronRight className={clsx('w-4 h-4 transition-transform', open && 'rotate-90')} strokeWidth={1.5} />
        <input
          value={node.attrs.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Expand title"
          className="bg-transparent outline-none grow"
        />
      </div>
      <NodeViewContent className={clsx('px-3 pb-3', !open && 'hidden')} />
    </NodeViewWrapper>
  )
}
