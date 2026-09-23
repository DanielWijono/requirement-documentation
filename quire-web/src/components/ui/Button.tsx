import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'default' | 'subtle' | 'danger' | 'link'
type Size = 'default' | 'compact' | 'touch'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconOnly?: boolean
  loading?: boolean
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-(--color-bg-accent) text-(--color-text-onaccent) hover:bg-(--color-bg-accent-hover) border border-transparent',
  default:
    'bg-(--color-bg-canvas) text-(--color-text-primary) border border-(--color-border-strong) hover:bg-(--color-bg-hover)',
  subtle: 'bg-transparent text-(--color-text-primary) border border-transparent hover:bg-(--color-bg-hover)',
  danger: 'bg-(--status-danger-bold) text-white border border-transparent hover:brightness-95',
  link: 'bg-transparent text-(--color-text-link) border border-transparent hover:underline px-0',
}

const sizeClass: Record<Size, string> = {
  default: 'h-8 px-3 text-sm gap-1.5',
  compact: 'h-7 px-2 text-[13px] gap-1',
  touch: 'h-10 px-4 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'default', icon, iconOnly, loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        't-ui-md-medium inline-flex items-center justify-center rounded-(--radius-sm) transition-colors',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        variantClass[variant],
        iconOnly ? 'w-8 h-8 p-0' : sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <span className="shrink-0 inline-flex [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      ) : null}
      {!iconOnly && children}
    </button>
  )
})

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
