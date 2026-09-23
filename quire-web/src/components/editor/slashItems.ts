import type { Editor } from '@tiptap/react'
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

export interface SlashItem {
  id: string
  label: string
  description: string
  keywords: string[]
  group: 'Basic' | 'Media' | 'Layout'
  icon: typeof Type
  run: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashItem[] = [
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

