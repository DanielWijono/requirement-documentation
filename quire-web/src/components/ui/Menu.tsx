import { useRef, useState } from 'react'
import type { MouseEvent, ReactElement, ReactNode } from 'react'
import { cloneElement } from 'react'
import clsx from 'clsx'
import { useClickOutside, useEscapeKey } from '../../hooks/useClickOutside'

export interface MenuItemSpec {
  label: string
  icon?: ReactNode
  onSelect?: () => void
  destructive?: boolean
  disabled?: boolean
  divider?: boolean
  shortcut?: string
}

export function Menu({
  trigger,
  items,
  align = 'start',
}: {
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>
  items: MenuItemSpec[]
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false), open)
  useEscapeKey(() => setOpen(false), open)

  const child = cloneElement(trigger, {
    onClick: (e: MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((o) => !o)
    },
  })

  return (
    <div className="relative inline-flex" ref={ref}>
      {child}
      {open && (
        <div
          role="menu"
          style={{ boxShadow: 'var(--elevation-2)' }}
          className={clsx(
            'absolute top-[calc(100%+4px)] min-w-[200px] py-1 rounded-(--radius-md) bg-(--color-bg-raised) z-(--z-popover)',
            align === 'start' ? 'left-0' : 'right-0',
          )}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 h-px bg-(--color-border-default)" role="separator" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.()
                  setOpen(false)
                }}
                className={clsx(
                  't-ui-md w-full flex items-center gap-2 h-8 px-3 text-left disabled:opacity-40',
                  'hover:bg-(--color-bg-hover)',
                  item.destructive ? 'text-(--status-danger-bold)' : 'text-(--color-text-primary)',
                )}
              >
                {item.icon && <span className="w-4 h-4 shrink-0 [&>svg]:w-4 [&>svg]:h-4">{item.icon}</span>}
                <span className="grow">{item.label}</span>
                {item.shortcut && <span className="t-ui-sm text-(--color-text-secondary)">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
