import clsx from 'clsx'
import type { User } from '../../types'
import { avatarColor } from '../../lib/avatarColor'


const SIZES = {
  16: 'w-4 h-4 text-[8px]',
  24: 'w-6 h-6 text-[10px]',
  32: 'w-8 h-8 text-xs',
  48: 'w-12 h-12 text-base',
  96: 'w-24 h-24 text-3xl',
} as const

export function Avatar({
  user,
  size = 32,
  presence = false,
  className,
}: {
  user: User
  size?: keyof typeof SIZES
  presence?: boolean
  className?: string
}) {
  const bg = avatarColor(user.colorSeed)
  return (
    <span className={clsx('relative inline-flex shrink-0', className)}>
      <span
        className={clsx(
          SIZES[size],
          'rounded-(--radius-round) inline-flex items-center justify-center font-medium select-none',
        )}
        style={{ background: bg, color: 'white' }}
        title={user.name}
      >
        {user.initials}
      </span>
      {presence && size >= 24 && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2"
          style={{
            width: size >= 48 ? 12 : 8,
            height: size >= 48 ? 12 : 8,
            background: 'var(--color-bg-accent)',
            // ring color needs to match whatever surface the avatar sits on
            boxShadow: '0 0 0 2px var(--color-bg-canvas)',
          }}
        />
      )}
    </span>
  )
}
