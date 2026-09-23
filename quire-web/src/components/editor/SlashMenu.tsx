import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { SLASH_ITEMS } from './slashItems'
import type { SlashItem } from './slashItems'

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
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.keywords.some((k) => k.includes(q)))
  }, [query])

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
        // Consume the first Escape so the editor does not also move focus to the toolbar.
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, editor, filtered, activeIndex, onCommit, onClose])

  if (!open || !rect) return null

  return (
    <div
      style={{ position: 'fixed', left: rect.left, top: rect.top + 8, boxShadow: 'var(--elevation-2)' }}
      className="z-(--z-popover) w-[320px] max-h-[360px] overflow-y-auto rounded-(--radius-md) bg-(--color-bg-raised) py-1"
    >
      {filtered.length === 0 && <p className="t-ui-md text-(--color-text-secondary) px-3 py-4 text-center">No matches</p>}
      {filtered.map((item, i) => {
        const showGroup = i === 0 || filtered[i - 1].group !== item.group
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
