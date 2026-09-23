import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

/** Destructive confirmation: initial focus lands on Cancel, never on the destructive action. */
export function ConfirmModal({
  open,
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="confirm"
      initialFocusDangerous
      footer={
        <>
          <Button variant="default" data-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="t-ui-md">{children}</div>
    </Modal>
  )
}
