import type { Editor } from '@tiptap/react'

/** Ask for a URL and apply it to the selection; an empty answer removes the link. */
export function promptForLink(editor: Editor) {
  const previousUrl = editor.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', previousUrl ?? 'https://')
  if (url === null) return
  if (url === '') {
    editor.chain().focus().unsetLink().run()
    return
  }
  editor.chain().focus().setLink({ href: url }).run()
}
