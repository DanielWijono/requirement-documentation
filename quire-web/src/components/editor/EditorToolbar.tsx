import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Editor } from '@tiptap/react'
import clsx from 'clsx'
import {
  Bold,
  CheckSquare,
  ChevronDown,
  Code2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MoreHorizontal,
  Plus,
  Quote,
  Smile,
  Strikethrough,
  Table as TableIcon,
  PanelBottomClose,
  Underline as UnderlineIcon,
  AtSign,
} from 'lucide-react'
import { Menu } from '../ui/Menu'
import { Tooltip } from '../ui/Tooltip'
import { users } from '../../data/mockData'
import type { WidthMode } from '../../types'
import { promptForLink } from './linkPrompt'

const EMOJI = ['😀', '🎉', '🚀', '✅', '⚠️', '💡', '❤️', '👀', '🔥', '📌']

const BLOCK_OPTIONS = [
  { value: 'paragraph', label: 'Normal' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'blockquote', label: 'Quote' },
  { value: 'codeBlock', label: 'Code block' },
]

function currentBlock(editor: Editor): string {
  for (let level = 1; level <= 4; level++) {
    if (editor.isActive('heading', { level })) return `h${level}`
  }
  if (editor.isActive('blockquote')) return 'blockquote'
  if (editor.isActive('codeBlock')) return 'codeBlock'
  return 'paragraph'
}

function ToolbarButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active?: boolean
  onClick: () => void
  icon: typeof Bold
  label: string
}) {
  return (
    <Tooltip label={label}>
      <button
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={clsx(
          'w-7 h-7 flex items-center justify-center rounded-(--radius-sm)',
          active ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </Tooltip>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-(--color-border-default) mx-1 shrink-0" />
}

export function EditorToolbar({
  editor,
  widthMode,
  onWidthModeChange,
}: {
  editor: Editor
  widthMode: WidthMode
  onWidthModeChange: (m: WidthMode) => void
}) {
  const [emojiOpen, setEmojiOpen] = useState(false)

  function setBlock(value: string) {
    if (value === 'paragraph') editor.chain().focus().setParagraph().run()
    else if (value.startsWith('h')) editor.chain().focus().toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 | 4 }).run()
    else if (value === 'blockquote') editor.chain().focus().toggleBlockquote().run()
    else if (value === 'codeBlock') editor.chain().focus().toggleCodeBlock().run()
  }

  // Roving tabindex (design.md §11): the toolbar is one tab stop; arrow keys move within it.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function toolbarItems() {
    const root = toolbarRef.current
    if (!root) return []
    return [...root.querySelectorAll<HTMLElement>('button, select')].filter((el) => !el.closest('[role="menu"]') && !el.hasAttribute('disabled'))
  }

  useEffect(() => {
    const items = toolbarItems()
    const current = Math.min(activeIndex, items.length - 1)
    items.forEach((el, i) => {
      el.tabIndex = i === current ? 0 : -1
    })
  })

  function onToolbarKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const items = toolbarItems()
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index === -1) return
    e.preventDefault()
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    setActiveIndex(next)
    items[next].focus()
  }

  return (
    <div
      ref={toolbarRef}
      id="editor-toolbar"
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onToolbarKeyDown}
      onFocus={(e) => {
        const index = toolbarItems().indexOf(e.target as HTMLElement)
        if (index !== -1) setActiveIndex(index)
      }}
      className="flex items-center gap-0.5 px-3 h-11 border-b border-(--color-border-default) bg-(--color-bg-canvas) sticky top-0 z-(--z-sticky) overflow-x-auto"
    >
      <select
        value={currentBlock(editor)}
        onChange={(e) => setBlock(e.target.value)}
        className="t-ui-md h-7 pl-2 pr-1 rounded-(--radius-sm) border border-transparent hover:border-(--color-border-strong) bg-transparent shrink-0"
        aria-label="Block type"
      >
        {BLOCK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <Divider />
      <ToolbarButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={UnderlineIcon} label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton icon={Code2} label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
      <ToolbarButton icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />

      <Divider />
      <ToolbarButton icon={List} label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={CheckSquare} label="Task list" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolbarButton icon={Quote} label="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />

      <Divider />
      <ToolbarButton icon={LinkIcon} label="Link" active={editor.isActive('link')} onClick={() => promptForLink(editor)} />
      <Menu
        trigger={
          <span>
            <ToolbarButton icon={AtSign} label="Mention" onClick={() => {}} />
          </span>
        }
        items={users.map((u) => ({
          label: u.name,
          onSelect: () => editor.chain().focus().insertContent({ type: 'mention', attrs: { userId: u.id, name: u.name } }).insertContent(' ').run(),
        }))}
      />
      <span className="relative">
        <ToolbarButton icon={Smile} label="Emoji" onClick={() => setEmojiOpen((v) => !v)} />
        {emojiOpen && (
          <div className="absolute top-[calc(100%+4px)] left-0 z-(--z-popover) grid grid-cols-5 gap-1 p-2 rounded-(--radius-md) bg-(--color-bg-raised)" style={{ boxShadow: 'var(--elevation-2)' }}>
            {EMOJI.map((em) => (
              <button
                key={em}
                onClick={() => {
                  editor.chain().focus().insertContent(em).run()
                  setEmojiOpen(false)
                }}
                className="w-8 h-8 flex items-center justify-center text-lg rounded-(--radius-sm) hover:bg-(--color-bg-hover)"
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </span>

      <Divider />
      <ToolbarButton icon={TableIcon} label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <ToolbarButton
        icon={PanelBottomClose}
        label="Expand"
        onClick={() => editor.chain().focus().insertContent({ type: 'expand', attrs: { title: 'Expand' }, content: [{ type: 'paragraph' }] }).run()}
      />
      <ToolbarButton icon={Code2} label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />

      <Divider />
      <ToolbarButton
        icon={Megaphone}
        label="Callout panel"
        onClick={() => editor.chain().focus().insertContent({ type: 'callout', attrs: { calloutType: 'info' }, content: [{ type: 'paragraph' }] }).run()}
      />

      <Divider />
      <Menu
        trigger={
          <button className="t-ui-md-medium h-7 px-2 rounded-(--radius-sm) inline-flex items-center gap-1 text-(--color-text-secondary) hover:bg-(--color-bg-hover) shrink-0">
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} /> Insert <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
          </button>
        }
        items={[
          { label: 'Image', icon: <ImageIcon className="w-4 h-4" strokeWidth={1.5} />, onSelect: () => {
            const url = window.prompt('Image URL')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          } },
          { label: 'Divider', icon: <Minus className="w-4 h-4" strokeWidth={1.5} />, onSelect: () => editor.chain().focus().setHorizontalRule().run() },
          { label: 'Table', icon: <TableIcon className="w-4 h-4" strokeWidth={1.5} />, onSelect: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
          { label: 'Callout panel', icon: <Megaphone className="w-4 h-4" strokeWidth={1.5} />, onSelect: () => editor.chain().focus().insertContent({ type: 'callout', attrs: { calloutType: 'info' }, content: [{ type: 'paragraph' }] }).run() },
          { label: 'Expand', icon: <PanelBottomClose className="w-4 h-4" strokeWidth={1.5} />, onSelect: () => editor.chain().focus().insertContent({ type: 'expand', attrs: { title: 'Expand' }, content: [{ type: 'paragraph' }] }).run() },
        ]}
      />

      <span className="ml-auto flex items-center gap-1 shrink-0 pl-2">
        <Menu
          align="end"
          trigger={
            <button className="t-ui-sm-medium h-7 px-2 rounded-(--radius-sm) inline-flex items-center gap-1 text-(--color-text-secondary) hover:bg-(--color-bg-hover)">
              <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
              {widthMode === 'reading' ? 'Reading' : widthMode === 'wide' ? 'Wide' : 'Full'}
            </button>
          }
          items={[
            { label: 'Reading width', onSelect: () => onWidthModeChange('reading') },
            { label: 'Wide', onSelect: () => onWidthModeChange('wide') },
            { label: 'Full width', onSelect: () => onWidthModeChange('full') },
          ]}
        />
      </span>
    </div>
  )
}
