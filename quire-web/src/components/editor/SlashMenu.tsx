import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import clsx from 'clsx'
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  PanelBottomClose,
  Quote,
  Table as TableIcon,
  Type,
} from 'lucide-react'

interface SlashItem {
  id: string
  label: string
  description: string
  keywords: string[]
  group: 'Basic' | 'Media' | 'Layout'
  icon: typeof Type
  run: (editor: Editor) => void
}

const ITEMS: SlashItem[] = [
  { id: 'text', label: 'Text', description: 'Plain paragraph', keywords: ['paragraph', 'normal'], group: 'Basic', icon: Type, run: (e) => e.chain().focus().setParagraph().run() },
  { id: 'h1', label: 'Heading 1', description: 'Large section heading', keywords: ['h1', 'title'], group: 'Basic', icon: Heading1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', description: 'Medium section heading', keywords: ['h2'], group: 'Basic', icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', description: 'Small section heading', keywords: ['h3'], group: 'Basic', icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet', label: 'Bulleted list', description: 'Unordered list', keywords: ['ul', 'bullet'], group: 'Basic', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'ordered', label: 'Numbered list', description: 'Ordered list', keywords: ['ol', 'number'], group: 'Basic', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: 'Task list', description: 'Checkbox list', keywords: ['todo', 'checkbox'], group: 'Basic', icon: CheckSquare, run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', label: 'Quote', description: 'Block quotation', keywords: ['blockquote'], group: 'Basic', icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code block', description: 'Monospaced code with a language', keywords: ['code', 'snippet'], group: 'Basic', icon: Code2, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: 'divider', label: 'Divider', description: 'Horizontal rule', keywords: ['hr', 'line'], group: 'Basic', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: 'image', label: 'Image', description: 'Embed from a URL', keywords: ['picture', 'media'], group: 'Media', icon: ImageIcon, run: (e) => {
    const url = window.prompt('Image URL')
    if (url) e.chain().focus().setImage({ src: url }).run()
  } },
  { id: 'callout', label: 'Callout panel', description: 'Info, note, success, warning, danger', keywords: ['note', 'info', 'panel', 'admonition'], group: 'Layout', icon: Megaphone, run: (e) => e.chain().focus().insertContent({ type: 'callout', attrs: { calloutType: 'info' }, content: [{ type: 'paragraph' }] }).run() },
  { id: 'expand', label: 'Expand', description: 'Collapsible section', keywords: ['collapse', 'details'], group: 'Layout', icon: PanelBottomClose, run: (e) => e.chain().focus().insertContent({ type: 'expand', attrs: { title: 'Expand' }, content: [{ type: 'paragraph' }] }).run() },
  { id: 'table', label: 'Table', description: '3×3 table with header row', keywords: ['grid'], group: 'Layout', icon: TableIcon, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]

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

export function SlashMenu({
  editor,
  open,
  query,
  rect,
  onCommit,
  onClose,
}: {
  editor: Editor | null
  open: boolean
  query: string
  rect: DOMRect | null
  onCommit: (item: SlashItem) => void
  onClose: () => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return ITEMS
    return ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.keywords.some((k) => k.includes(q)))
  }, [query])

  useEffect(() => setActiveIndex(0), [query, open])

  useEffect(() => {
    if (!open || !editor) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[activeIndex]) onCommit(filtered[activeIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, editor, filtered, activeIndex, onCommit, onClose])

  if (!open || !rect) return null

  let lastGroup: string | null = null

  return (
    <div
      style={{ position: 'fixed', left: rect.left, top: rect.top + 8, boxShadow: 'var(--elevation-2)' }}
      className="z-(--z-popover) w-[320px] max-h-[360px] overflow-y-auto rounded-(--radius-md) bg-(--color-bg-raised) py-1"
    >
      {filtered.length === 0 && <p className="t-ui-md text-(--color-text-secondary) px-3 py-4 text-center">No matches</p>}
      {filtered.map((item, i) => {
        const showGroup = item.group !== lastGroup
        lastGroup = item.group
        const Icon = item.icon
        return (
          <div key={item.id}>
            {showGroup && <p className="t-ui-sm text-(--color-text-secondary) px-3 pt-2 pb-1">{item.group}</p>}
            <button
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => onCommit(item)}
              className={clsx('w-full flex items-center gap-2.5 px-3 h-9 text-left', i === activeIndex ? 'bg-(--color-bg-selected)' : 'hover:bg-(--color-bg-hover)')}
            >
              <Icon className="w-4 h-4 shrink-0 text-(--color-text-secondary)" strokeWidth={1.5} />
              <span className="min-w-0">
                <span className="t-ui-md block">{item.label}</span>
                <span className="t-ui-sm text-(--color-text-secondary) block truncate">{item.description}</span>
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
