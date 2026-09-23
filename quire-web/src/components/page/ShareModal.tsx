import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useUIStore } from '../../store/uiStore'
import { users } from '../../data/mockData'
import type { Page } from '../../types'

type Scope = 'anyone-space' | 'anyone-view-some-edit' | 'specific'

export function ShareModal({ page, open, onClose }: { page: Page; open: boolean; onClose: () => void }) {
  const [scope, setScope] = useState<Scope>(page.restricted ? 'specific' : 'anyone-space')
  const [people, setPeople] = useState(page.restricted ? [users[1], users[2]] : [])
  const pushToast = useUIStore((s) => s.pushToast)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              pushToast({ message: 'Restrictions updated', tone: 'success' })
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <section className="mb-5">
        <p className="t-ui-md-medium mb-2">Link sharing</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={`quire.app/spaces/${page.spaceId}/pages/${page.id}`}
            className="t-ui-md grow h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-sunken)"
          />
          <Button
            variant="default"
            icon={<Copy strokeWidth={1.5} />}
            onClick={() => {
              navigator.clipboard?.writeText(`https://quire.app/spaces/${page.spaceId}/pages/${page.id}`)
              pushToast({ message: 'Link copied', tone: 'success' })
            }}
          >
            Copy link
          </Button>
        </div>
      </section>

      <section>
        <p className="t-ui-md-medium mb-2">Restrictions</p>
        <div className="flex flex-col gap-2">
          <RadioRow
            checked={scope === 'anyone-space'}
            onSelect={() => setScope('anyone-space')}
            label="Anyone in space can view and edit"
          />
          <RadioRow
            checked={scope === 'anyone-view-some-edit'}
            onSelect={() => setScope('anyone-view-some-edit')}
            label="Anyone can view, some can edit"
          />
          <RadioRow checked={scope === 'specific'} onSelect={() => setScope('specific')} label="Only specific people can view or edit" />
        </div>

        {scope === 'specific' && (
          <div className="mt-3 pl-6">
            <div className="flex flex-col gap-2 mb-2">
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Avatar user={p} size={24} />
                  <span className="t-ui-md grow">{p.name}</span>
                  <select className="t-ui-sm h-7 px-1.5 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)">
                    <option>Can view</option>
                    <option>Can edit</option>
                  </select>
                  <button
                    onClick={() => setPeople((prev) => prev.filter((u) => u.id !== p.id))}
                    className="w-6 h-6 flex items-center justify-center text-(--color-text-secondary) hover:bg-(--color-bg-hover) rounded-(--radius-sm)"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value)
                if (u && !people.some((p) => p.id === u.id)) setPeople((prev) => [...prev, u])
              }}
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            >
              <option value="">Add a person…</option>
              {users
                .filter((u) => !people.some((p) => p.id === u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <p className="t-ui-sm text-(--color-text-secondary) mt-3">
          Inherited from <span className="text-(--color-text-link) underline">Architecture</span>: Engineering team can
          view.
        </p>
      </section>
    </Modal>
  )
}

function RadioRow({ checked, onSelect, label }: { checked: boolean; onSelect: () => void; label: string }) {
  return (
    <label className="t-ui-md flex items-center gap-2 cursor-pointer">
      <input type="radio" checked={checked} onChange={onSelect} className="accent-(--color-bg-accent)" />
      {label}
    </label>
  )
}
