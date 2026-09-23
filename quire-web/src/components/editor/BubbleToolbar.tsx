import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Bold, Code2, Highlighter, Italic, Link as LinkIcon, MessageSquarePlus } from 'lucide-react'
import clsx from 'clsx'

export function BubbleToolbar({ editor, onComment }: { editor: Editor; onComment: (selectedText: string) => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    function update() {
      const { from, to, empty } = editor.state.selection
      if (empty || !editor.isFocused) {
        setRect(null)
        return
      }
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      const left = Math.min(start.left, end.left)
      const right = Math.max(start.right, end.right)
      const top = Math.min(start.top, end.top)
      setRect(new DOMRect(left, top, right - left, 0))
    }
    editor.on('selectionUpdate', update)
    editor.on('blur', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', update)
    }
  }, [editor])

  if (!rect) return null

  function Btn({ active, onClick, icon: Icon, label }: { active?: boolean; onClick: () => void; icon: typeof Bold; label: string }) {
    return (
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        aria-label={label}
        className={clsx('w-7 h-7 flex items-center justify-center rounded-(--radius-sm)', active ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'text-(--color-text-onaccent) hover:bg-white/10')}
      >
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top - 44,
        transform: 'translateX(-50%)',
        background: 'var(--color-text-primary)',
        boxShadow: 'var(--elevation-2)',
      }}
      className="z-(--z-popover) flex items-center gap-0.5 px-1 py-1 rounded-(--radius-md)"
    >
      <Btn icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Btn icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Btn icon={Code2} label="Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
      <Btn
        icon={LinkIcon}
        label="Link"
        active={editor.isActive('link')}
        onClick={() => {
          const url = window.prompt('Link URL', 'https://')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }}
      />
      <Btn icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
      <span className="w-px h-5 bg-white/20 mx-0.5" />
      <Btn
        icon={MessageSquarePlus}
        label="Comment"
        onClick={() => {
          const { from, to } = editor.state.selection
          const text = editor.state.doc.textBetween(from, to, ' ')
          onComment(text)
        }}
      />
    </div>
  )
}
