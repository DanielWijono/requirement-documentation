import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useEscapeKey } from '../../hooks/useClickOutside'
import { Button } from './Button'

const WIDTHS = { confirm: 400, form: 600, picker: 800 } as const

export function Modal({
  open,
  onClose,
  title,
  width = 'form',
  footer,
  children,
  initialFocusDangerous = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  width?: keyof typeof WIDTHS
  footer?: ReactNode
  children: ReactNode
  /** For destructive confirms: put initial focus on Cancel, not the primary action. */
  initialFocusDangerous?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEscapeKey(onClose, open)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement
    const target = initialFocusDangerous
      ? dialogRef.current?.querySelector<HTMLElement>('[data-cancel]')
      : dialogRef.current?.querySelector<HTMLElement>('input,textarea,select,[data-autofocus]')
    ;(target ?? dialogRef.current)?.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [open, initialFocusDangerous])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width: WIDTHS[width], maxWidth: '100%', boxShadow: 'var(--elevation-3)' }}
        className={clsx('relative bg-(--color-bg-raised) rounded-(--radius-lg) max-h-[80vh] flex flex-col')}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-(--color-border-default) shrink-0">
          <h2 className="t-ui-lg">{title}</h2>
          <Button variant="subtle" iconOnly icon={<X strokeWidth={1.5} />} onClick={onClose} aria-label="Close" />
        </div>
        <div className="px-5 py-4 overflow-y-auto grow">{children}</div>
        {footer && (
          <div className="px-5 h-14 border-t border-(--color-border-default) flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
