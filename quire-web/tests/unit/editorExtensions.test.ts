import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { EditorShortcuts } from '../../src/components/editor/extensions/editorShortcuts'
import { SmartLinks, parsePageUrl } from '../../src/components/editor/extensions/smartLinks'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function makeEditor(extra: Parameters<typeof EditorShortcuts.configure>[0] = {}) {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      EditorShortcuts.configure({ onLink: () => {}, onEscape: () => {}, ...extra }),
      SmartLinks.configure({ resolveTitle: (_s, p) => (p === 'pg.onboarding' ? 'Onboarding' : null) }),
    ],
    content: '<p>hello world</p>',
  })
  return editor
}

describe('EditorShortcuts', () => {
  it('Mod-` toggles inline code on the selection', () => {
    const e = makeEditor()
    e.commands.setTextSelection({ from: 1, to: 6 })
    e.commands.keyboardShortcut('Mod-`')
    expect(e.getHTML()).toContain('<code>hello</code>')
  })

  it('Mod-k calls onLink and Escape calls onEscape', () => {
    const onLink = vi.fn()
    const onEscape = vi.fn()
    const e = makeEditor({ onLink, onEscape })
    e.commands.keyboardShortcut('Mod-k')
    e.commands.keyboardShortcut('Escape')
    expect(onLink).toHaveBeenCalledOnce()
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Tiptap defaults cover the rest of design.md §9.1', () => {
    const e = makeEditor()
    e.commands.keyboardShortcut('Mod-Alt-2')
    expect(e.isActive('heading', { level: 2 })).toBe(true)
    e.commands.keyboardShortcut('Mod-Alt-0')
    expect(e.isActive('paragraph')).toBe(true)
    e.commands.keyboardShortcut('Mod-Shift-8')
    expect(e.isActive('bulletList')).toBe(true)
  })
})

describe('SmartLinks', () => {
  it('parses internal page URLs only', () => {
    expect(parsePageUrl('/spaces/sp.eng/pages/pg.onboarding')).toMatchObject({ spaceId: 'sp.eng', pageId: 'pg.onboarding' })
    expect(parsePageUrl(`${window.location.origin}/spaces/sp.eng/pages/pg.x/`)).toMatchObject({ pageId: 'pg.x' })
    expect(parsePageUrl('https://example.com/spaces/sp.eng/pages/pg.x')).toBeNull()
    expect(parsePageUrl('/spaces/sp.eng')).toBeNull()
  })

  function paste(e: Editor, text: string) {
    const event = { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } } as unknown as ClipboardEvent
    return e.view.someProp('handlePaste', (f) => f(e.view, event, e.state.doc.slice(0, 0)))
  }

  it('turns a pasted page URL into a titled chip; undo restores the plain URL', () => {
    const e = makeEditor()
    e.commands.setTextSelection(12)
    const url = `${window.location.origin}/spaces/sp.eng/pages/pg.onboarding`
    expect(paste(e, url)).toBe(true)
    expect(e.getHTML()).toContain('<a class="smart-link" href="/spaces/sp.eng/pages/pg.onboarding">Onboarding</a>')
    e.commands.undo()
    expect(e.getHTML()).toContain(url)
    expect(e.getHTML()).not.toContain('smart-link')
  })

  it('leaves unknown pages and external URLs to the default paste', () => {
    const e = makeEditor()
    expect(paste(e, '/spaces/sp.eng/pages/pg.unknown')).toBeFalsy()
    expect(paste(e, 'https://example.com')).toBeFalsy()
  })
})
