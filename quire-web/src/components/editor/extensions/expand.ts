import { ExpandNode } from '@quire/editor'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ExpandView } from './ExpandView'

/** The shared expand node (`@quire/editor`) with its editing view. */
export const Expand = ExpandNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ExpandView)
  },
})
