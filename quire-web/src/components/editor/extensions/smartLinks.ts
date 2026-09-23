import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { parsePageUrl } from '../../../lib/pageUrl'

export interface SmartLinksOptions {
  /** Title of the page an internal URL points to, or null if it is not a known page. */
  resolveTitle: (spaceId: string, pageId: string) => string | null
}

/**
 * Pasting a page URL inserts it as a smart-link chip titled with the page name (design.md §9.4).
 * The URL goes in as its own history step first, so ⌘Z right after the paste reverts to the plain URL.
 */
export const SmartLinks = Extension.create<SmartLinksOptions>({
  name: 'smartLinks',
  priority: 1000,

  addOptions() {
    return { resolveTitle: () => null }
  },

  addProseMirrorPlugins() {
    const { resolveTitle } = this.options
    return [
      new Plugin({
        key: new PluginKey('smartLinks'),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain') ?? ''
            const parsed = parsePageUrl(text)
            if (!parsed) return false
            const title = resolveTitle(parsed.spaceId, parsed.pageId)
            if (!title) return false

            const url = text.trim()
            const from = view.state.selection.from
            view.dispatch(view.state.tr.insertText(url))

            const linkType = view.state.schema.marks.link
            if (!linkType) return true
            const tr = closeHistory(view.state.tr)
            const mark = linkType.create({ href: parsed.path, class: 'smart-link', target: null, rel: null })
            tr.replaceWith(from, from + url.length, view.state.schema.text(title, [mark]))
            view.dispatch(tr)
            return true
          },
        },
      }),
    ]
  },
})
