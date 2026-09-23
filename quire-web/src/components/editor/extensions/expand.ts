import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ExpandView } from './ExpandView'

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
