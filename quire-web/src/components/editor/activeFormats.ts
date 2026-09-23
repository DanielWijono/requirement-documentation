import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'

export function currentBlock(editor: Editor): string {
  for (let level = 1; level <= 4; level++) {
    if (editor.isActive('heading', { level })) return `h${level}`
  }
  if (editor.isActive('blockquote')) return 'blockquote'
  if (editor.isActive('codeBlock')) return 'codeBlock'
  return 'paragraph'
}

const TRACKED = ['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'link', 'codeBlock'] as const

/** Re-render on every editor transaction that changes formatting state (Tiptap v3 does not by default). */
export function useActiveFormats(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: currentBlock(e),
      ...(Object.fromEntries(TRACKED.map((name) => [name, e.isActive(name)])) as Record<(typeof TRACKED)[number], boolean>),
    }),
  })
}
