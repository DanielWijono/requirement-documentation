import { mergeAttributes, Node } from '@tiptap/core'

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      userId: { default: null },
      name: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'mention', 'data-mention': node.attrs.userId }),
      `@${node.attrs.name}`,
    ]
  },
})
