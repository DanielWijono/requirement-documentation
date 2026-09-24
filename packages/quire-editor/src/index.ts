import { mergeAttributes, Node, type AnyExtension } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'

/**
 * The page document schema, shared by the browser editor and the API (which turns collaborative
 * documents into HTML and back). Only what defines the document lives here: node views, toolbars and
 * shortcuts stay in the web app.
 */

/** Only what the parse rules read from elements, so the schema compiles without DOM types (the API has none). */
interface ParsedElement {
  getAttribute(name: string): string | null
  querySelector(selectors: string): { textContent: string | null } | null
}

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      calloutType: { default: 'info', renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', getAttrs: (el) => ({ calloutType: (el as ParsedElement).getAttribute('data-callout') }) }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.calloutType }), 0]
  },
})

export const ExpandNode = Node.create({
  name: 'expand',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      // Both attrs are placed manually in renderHTML (title as <summary> text,
      // open deliberately omitted so published HTML always collapses) rather than
      // serialized as raw HTML attributes, so opt out of Tiptap's automatic rendering.
      open: { default: true, renderHTML: () => ({}) },
      title: { default: 'Expand', renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-expand]',
        // Typed loosely so this compiles with and without DOM types; at runtime it is the element.
        contentElement: (el: ParsedElement) => (el.querySelector(':scope > div') ?? el) as never,
        getAttrs: (el) => ({
          title: (el as ParsedElement).querySelector(':scope > summary')?.textContent ?? 'Expand',
          open: true,
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Published output always renders collapsed; the `open` attribute only drives the
    // in-editor authoring convenience, not the read-mode default.
    return [
      'details',
      mergeAttributes(HTMLAttributes, { 'data-expand': 'true' }),
      ['summary', {}, node.attrs.title || 'Expand'],
      ['div', {}, 0],
    ]
  },
})

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
    return ['span', mergeAttributes(HTMLAttributes, { class: 'mention', 'data-mention': node.attrs.userId }), `@${node.attrs.name}`]
  },
})

/** The Yjs field the page body lives in. */
export const COLLAB_FIELD = 'default'

/** The document name of a page's collaborative draft. */
export const collabDocumentName = (pageId: string) => `page:${pageId}`
export const pageIdFromDocumentName = (name: string) => (name.startsWith('page:') ? name.slice(5) : null)

/**
 * Every extension that shapes the document. `collaborative` drops StarterKit's undo history,
 * which Yjs replaces with its own.
 */
export function schemaExtensions({ collaborative = false }: { collaborative?: boolean } = {}): AnyExtension[] {
  return [
    StarterKit.configure({ link: false, ...(collaborative ? { undoRedo: false } : {}) }),
    Highlight,
    Link.configure({ openOnClick: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    CalloutNode,
    ExpandNode,
    Mention,
  ]
}
