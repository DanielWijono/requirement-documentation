import { Extension } from '@tiptap/core'

export interface EditorShortcutsOptions {
  /** ⌘K inside the editor: insert or edit a link (overrides the global command palette). */
  onLink: () => void
  /** Escape with no menu open: move focus to the formatting toolbar. */
  onEscape: () => void
}

/** Shortcuts from design.md §9.1 that Tiptap does not provide by default. */
export const EditorShortcuts = Extension.create<EditorShortcutsOptions>({
  name: 'editorShortcuts',

  addOptions() {
    return { onLink: () => {}, onEscape: () => {} }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-`': () => this.editor.commands.toggleCode(),
      'Mod-k': () => {
        this.options.onLink()
        return true
      },
      Escape: () => {
        this.options.onEscape()
        return true
      },
    }
  },
})
