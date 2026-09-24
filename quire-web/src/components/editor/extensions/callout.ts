import { CalloutNode } from '@quire/editor'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from './CalloutView'

/** The shared callout node (`@quire/editor`) with its editing view. */
export const Callout = CalloutNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
