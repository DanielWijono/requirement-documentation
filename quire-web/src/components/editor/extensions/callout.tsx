import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import { AlertTriangle, CircleAlert, Info, Lightbulb, OctagonAlert } from 'lucide-react'

export type CalloutType = 'info' | 'note' | 'success' | 'warning' | 'danger'

const TONE: Record<CalloutType, { label: string; icon: typeof Info; bg: string; text: string }> = {
  info: { label: 'Info', icon: Info, bg: 'var(--status-info-subtle)', text: 'var(--status-info-text)' },
  note: { label: 'Note', icon: Lightbulb, bg: 'var(--status-neutral-subtle)', text: 'var(--status-neutral-text)' },
  success: { label: 'Success', icon: CircleAlert, bg: 'var(--status-success-subtle)', text: 'var(--status-success-text)' },
  warning: { label: 'Warning', icon: AlertTriangle, bg: 'var(--status-warning-subtle)', text: 'var(--status-warning-text)' },
  danger: { label: 'Danger', icon: OctagonAlert, bg: 'var(--status-danger-subtle)', text: 'var(--status-danger-text)' },
}

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const type = (node.attrs.calloutType as CalloutType) ?? 'info'
  const tone = TONE[type]
  const Icon = tone.icon
  return (
    <NodeViewWrapper
      data-callout={type}
      className="my-1 rounded-(--radius-md) p-3 flex gap-2"
      style={{ background: tone.bg, color: tone.text }}
    >
      <span contentEditable={false} className="shrink-0 pt-0.5">
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 grow">
        <select
          contentEditable={false}
          value={type}
          onChange={(e) => updateAttributes({ calloutType: e.target.value })}
          className="t-ui-sm-medium mb-1 bg-transparent border-none outline-none cursor-pointer"
          style={{ color: tone.text }}
        >
          {Object.entries(TONE).map(([key, t]) => (
            <option key={key} value={key}>
              {t.label}
            </option>
          ))}
        </select>
        <NodeViewContent className="prose-callout" />
      </div>
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      calloutType: { default: 'info', renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', getAttrs: (el) => ({ calloutType: (el as HTMLElement).getAttribute('data-callout') }) }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.calloutType }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
