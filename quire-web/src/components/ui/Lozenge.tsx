import clsx from 'clsx'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

export type Status = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const styleFor: Record<Status, string> = {
  success: 'bg-(--status-success-subtle) text-(--status-success-text)',
  warning: 'bg-(--status-warning-subtle) text-(--status-warning-text)',
  danger: 'bg-(--status-danger-subtle) text-(--status-danger-text)',
  info: 'bg-(--status-info-subtle) text-(--status-info-text)',
  neutral: 'bg-(--status-neutral-subtle) text-(--status-neutral-text)',
}

export function Lozenge({
  children,
  status = 'neutral',
  icon,
  className,
}: {
  children: ReactNode
  status?: Status
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        't-ui-sm-medium inline-flex items-center gap-1 h-5 px-1.5 rounded-(--radius-sm) whitespace-nowrap',
        styleFor[status],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function RestrictedLozenge({ className }: { className?: string }) {
  return (
    <Lozenge status="neutral" icon={<Lock className="w-3 h-3" strokeWidth={1.5} />} className={className}>
      Restricted
    </Lozenge>
  )
}

export function CounterBadge({ count }: { count: number }) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span className="t-ui-sm-medium inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-(--radius-round) bg-(--status-danger-bold) text-white leading-none">
      {label}
    </span>
  )
}
