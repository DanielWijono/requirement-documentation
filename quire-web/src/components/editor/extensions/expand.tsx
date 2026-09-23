import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

function ExpandView({ node, updateAttributes }: NodeViewProps) {
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

export const Expand = Node.create({
  name: 'expand',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      // Both attrs are placed manually in renderHTML (title as <summary> text,
      // open deliberately omitted so published HTML always collapses) rather than
      // serialized as raw HTML attributes, so opt out of Tiptap's automatic rendering.
      open: { default: true, renderHTML: () => ({}) },
      title: { default: 'Expand', renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-expand]',
        contentElement: (el: HTMLElement) => el.querySelector(':scope > div') ?? el,
        getAttrs: (el: HTMLElement) => ({
          title: el.querySelector(':scope > summary')?.textContent ?? 'Expand',
          open: true,
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Published output always renders collapsed; the `open` attribute only drives the
    // in-editor authoring convenience, not the read-mode default.
    return [
      'details',
      mergeAttributes(HTMLAttributes, { 'data-expand': 'true' }),
      ['summary', {}, node.attrs.title || 'Expand'],
      ['div', {}, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExpandView)
  },
})
