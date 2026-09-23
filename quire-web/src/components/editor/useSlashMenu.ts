import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { SlashItem } from './slashItems'

export function useSlashMenu(editor: Editor | null) {
  const [state, setState] = useState<{ open: boolean; query: string; range: { from: number; to: number }; rect: DOMRect | null }>({
    open: false,
    query: '',
    range: { from: 0, to: 0 },
    rect: null,
  })

  useEffect(() => {
    if (!editor) return
    function check() {
      if (!editor) return
      const { $from } = editor.state.selection
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
      const match = /(?:^|\s)\/(\w*)$/.exec(textBefore)
      if (!match) {
        setState((s) => (s.open ? { ...s, open: false } : s))
        return
      }
      const from = $from.pos - match[0].length + (match[0].startsWith(' ') ? 1 : 0)
      const to = $from.pos
      const coords = editor.view.coordsAtPos(to)
      setState({ open: true, query: match[1], range: { from, to }, rect: new DOMRect(coords.left, coords.bottom, 0, 0) })
    }
    editor.on('selectionUpdate', check)
    editor.on('update', check)
    return () => {
      editor.off('selectionUpdate', check)
      editor.off('update', check)
    }
  }, [editor])

  function close() {
    setState((s) => ({ ...s, open: false }))
  }

  function commit(item: SlashItem) {
    if (!editor) return
    editor.chain().focus().deleteRange(state.range).run()
    item.run(editor)
    close()
  }

  return { ...state, close, commit }
}
