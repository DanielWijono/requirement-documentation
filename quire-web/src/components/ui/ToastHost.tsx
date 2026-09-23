import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

const ICONS = {
  success: <CheckCircle2 className="w-4 h-4 text-(--status-success-bold)" strokeWidth={1.5} />,
  info: <Info className="w-4 h-4 text-(--status-info-bold)" strokeWidth={1.5} />,
  danger: <XCircle className="w-4 h-4 text-(--status-danger-bold)" strokeWidth={1.5} />,
}

export function ToastHost() {
  const toasts = useUIStore((s) => s.toasts)
  const dismiss = useUIStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed bottom-4 left-4 z-(--z-toast) flex flex-col gap-2 w-[320px]">
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          role="status"
          style={{ boxShadow: 'var(--elevation-2)' }}
          className={clsx(
            't-ui-md flex items-center gap-2 px-3 h-11 rounded-(--radius-md) bg-(--color-bg-raised) text-(--color-text-primary)',
          )}
        >
          {ICONS[t.tone]}
          <span className="grow truncate">{t.message}</span>
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.()
                dismiss(t.id)
              }}
              className="t-ui-md-medium text-(--color-text-link) shrink-0"
            >
              {t.actionLabel}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 text-(--color-text-secondary)">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
