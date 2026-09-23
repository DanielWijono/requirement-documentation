import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { Editor as ReactEditor } from '@tiptap/react'

/** A real Tiptap editor mounted in the document, for component tests of editor chrome. */
export function mountEditor(content = '<p>hello world</p>') {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: [StarterKit.configure({ link: false }), Highlight, Link.configure({ openOnClick: false }), TaskList, TaskItem, Table, TableRow, TableCell, TableHeader],
    content,
  })
  return {
    editor: editor as unknown as ReactEditor,
    destroy: () => {
      editor.destroy()
      element.remove()
    },
  }
}
