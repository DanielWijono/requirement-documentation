import { cloneElement, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent, ReactElement } from 'react'
import clsx from 'clsx'

interface TriggerProps {
  onMouseEnter?: (e: MouseEvent) => void
  onMouseLeave?: (e: MouseEvent) => void
  onFocus?: (e: FocusEvent) => void
  onBlur?: (e: FocusEvent) => void
}

export function Tooltip({
  label,
  shortcut,
  children,
  side = 'bottom',
}: {
  label: string
  shortcut?: string
  children: ReactElement<TriggerProps>
  side?: 'bottom' | 'top' | 'right'
}) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    timer.current = setTimeout(() => setVisible(true), 500)
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }

  const child = cloneElement(children, {
    onMouseEnter: (e: MouseEvent) => {
      show()
      children.props.onMouseEnter?.(e)
    },
    onMouseLeave: (e: MouseEvent) => {
      hide()
      children.props.onMouseLeave?.(e)
    },
    onFocus: (e: FocusEvent) => {
      show()
      children.props.onFocus?.(e)
    },
    onBlur: (e: FocusEvent) => {
      hide()
      children.props.onBlur?.(e)
    },
  })

  return (
    <span className="relative inline-flex">
      {child}
      {visible && (
        <span
          role="tooltip"
          className={clsx(
            't-ui-sm absolute z-(--z-tooltip) px-2 py-1 rounded-(--radius-sm) whitespace-nowrap max-w-[240px] pointer-events-none',
            side === 'bottom' && 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
            side === 'top' && 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
            side === 'right' && 'left-[calc(100%+6px)] top-1/2 -translate-y-1/2',
          )}
          style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-canvas)' }}
        >
          {label}
          {shortcut && <span className="opacity-60 ml-1.5">{shortcut}</span>}
        </span>
      )}
    </span>
  )
}
