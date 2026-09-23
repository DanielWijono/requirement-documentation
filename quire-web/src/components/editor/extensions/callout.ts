import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from './CalloutView'

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
