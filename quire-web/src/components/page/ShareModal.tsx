import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useUIStore } from '../../store/uiStore'
import type { PageRestrictionsDto, PrincipalDto, PrincipalRef } from '@quire/shared'
import { useRestrictions, useSetRestrictions } from '../../queries/pages'
import { useUserList, useUserLookup } from '../../queries/users'
import { useCurrentUser } from '../../hooks/useSession'
import { pageUrl } from './usePageActions'
import type { Page } from '../../types'

type Scope = 'anyone-space' | 'anyone-view-some-edit' | 'specific'
type Role = 'view' | 'edit'
type Person = { id: string; role: Role }

function initialScope(r: PageRestrictionsDto): Scope {
  if (r.view.length) return 'specific'
  return r.edit.length ? 'anyone-view-some-edit' : 'anyone-space'
}

/** People on the page's own lists (other than you), with the role each one has. */
function initialPeople(r: PageRestrictionsDto, meId: string): Person[] {
  const users = (list: PrincipalDto[]) => list.filter((p) => p.type === 'user' && p.id !== meId).map((p) => p.id)
  const viewers = users(r.view)
  const editors = users(r.edit)
  const ids = [...new Set([...viewers, ...editors])]
  // With no edit list, everyone who can view can edit.
  return ids.map((id) => ({ id, role: r.edit.length === 0 || editors.includes(id) ? 'edit' : 'view' }))
}

export function ShareModal({ page, open, onClose }: { page: Page; open: boolean; onClose: () => void }) {
  const restrictions = useRestrictions(page.id, open)
  if (!open) return null
  if (!restrictions.data) {
    return (
      <Modal open onClose={onClose} title="Share">
        {restrictions.isError ? (
          <p role="alert" className="t-ui-md text-(--status-danger-text)">
            Couldn’t load who can see this page: {restrictions.error.message}
          </p>
        ) : (
          <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
        )}
      </Modal>
    )
  }
  // Mount the body with the loaded restrictions so each opening starts from what's saved.
  return <ShareModalBody page={page} restrictions={restrictions.data} onClose={onClose} />
}

function ShareModalBody({ page, restrictions, onClose }: { page: Page; restrictions: PageRestrictionsDto; onClose: () => void }) {
  const userById = useUserLookup()
  const users = useUserList()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const setRestrictions = useSetRestrictions()
  const pushToast = useUIStore((s) => s.pushToast)
  const [scope, setScope] = useState<Scope>(initialScope(restrictions))
  const [people, setPeople] = useState(() => initialPeople(restrictions, currentUser.id))
  const url = pageUrl(page)
  const canChange = Boolean(page.access?.restrict)
  // Groups on the lists aren't edited here; they are kept as they are.
  const groups = (list: PrincipalDto[]): PrincipalRef[] => list.filter((p) => p.type === 'group').map((p) => ({ type: 'group', id: p.id }))

  function save() {
    const asRefs = (ids: string[]): PrincipalRef[] => ids.map((id) => ({ type: 'user', id }))
    // You are always an editor: an empty edit list would let every viewer edit.
    const editors = asRefs([currentUser.id, ...people.filter((p) => p.role === 'edit').map((p) => p.id)])
    const everyone = asRefs(people.map((p) => p.id))
    // The server also keeps you on any list you set, so you cannot lock yourself out.
    const input =
      scope === 'anyone-space'
        ? { view: [], edit: [] }
        : scope === 'anyone-view-some-edit'
          ? { view: [], edit: [...editors, ...groups(restrictions.edit)] }
          : { view: [...everyone, ...groups(restrictions.view)], edit: [...editors, ...groups(restrictions.edit)] }
    setRestrictions.mutate(
      { page, input },
      {
        onSuccess: () => {
          onClose()
          pushToast({ message: 'Restrictions updated', tone: 'success' })
        },
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Share"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          {canChange && (
            <Button variant="primary" onClick={save} loading={setRestrictions.isPending}>
              Save
            </Button>
          )}
        </>
      }
    >
      <section className="mb-5">
        <p className="t-ui-md-medium mb-2">Link sharing</p>
        <div className="flex gap-2">
          <input
            readOnly
            aria-label="Page link"
            value={url}
            className="t-ui-md grow min-w-0 h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-sunken)"
          />
          <Button
            variant="default"
            icon={<Copy strokeWidth={1.5} />}
            onClick={() => {
              void navigator.clipboard?.writeText(url)
              pushToast({ message: 'Link copied', tone: 'success' })
            }}
          >
            Copy link
          </Button>
        </div>
      </section>

      <section>
        <fieldset disabled={!canChange}>
          <legend className="t-ui-md-medium mb-2">Restrictions</legend>
          {!canChange && <p className="t-ui-sm text-(--color-text-secondary) mb-2">Only people who can edit this page can change its restrictions.</p>}
          <div className="flex flex-col gap-2">
            <RadioRow checked={scope === 'anyone-space'} onSelect={() => setScope('anyone-space')} label="Anyone in space can view and edit" />
            <RadioRow checked={scope === 'anyone-view-some-edit'} onSelect={() => setScope('anyone-view-some-edit')} label="Anyone can view, some can edit" />
            <RadioRow checked={scope === 'specific'} onSelect={() => setScope('specific')} label="Only specific people can view or edit" />
          </div>
        </fieldset>

        {scope !== 'anyone-space' && (
          <div className="mt-3 pl-6">
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Avatar user={currentUser} size={24} />
                <span className="t-ui-md grow">{currentUser.name} (you)</span>
                <span className="t-ui-sm text-(--color-text-secondary)">Can edit</span>
              </div>
              {people.map((p) => {
                const user = userById(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <Avatar user={user} size={24} />
                    <span className="t-ui-md grow">{user.name}</span>
                    <select
                      aria-label={`Role for ${user.name}`}
                      value={p.role}
                      onChange={(e) => setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, role: e.target.value as Role } : x)))}
                      className="t-ui-sm h-7 px-1.5 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
                    >
                      {scope === 'specific' && <option value="view">Can view</option>}
                      <option value="edit">Can edit</option>
                      {scope === 'anyone-view-some-edit' && <option value="view">Can view only</option>}
                    </select>
                    <button
                      onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
                      className="w-6 h-6 flex items-center justify-center text-(--color-text-secondary) hover:bg-(--color-bg-hover) rounded-(--radius-sm)"
                      aria-label={`Remove ${user.name}`}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                )
              })}
            </div>
            <select
              aria-label="Add a person"
              value=""
              onChange={(e) => {
                const id = e.target.value
                if (id && !people.some((p) => p.id === id)) setPeople((prev) => [...prev, { id, role: 'edit' }])
              }}
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            >
              <option value="">Add a person…</option>
              {users
                .filter((u) => u.id !== currentUser.id && !people.some((p) => p.id === u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {restrictions.inherited.length > 0 && (
          <div className="mt-4">
            <p className="t-ui-sm-medium text-(--color-text-secondary) mb-1">Inherited restrictions</p>
            <ul className="t-ui-sm text-(--color-text-secondary) flex flex-col gap-1">
              {restrictions.inherited.map((a) => (
                <li key={a.pageId}>
                  From{' '}
                  <button
                    className="text-(--color-text-link) underline"
                    onClick={() => {
                      onClose()
                      navigate(`/spaces/${page.spaceId}/pages/${a.pageId}`)
                    }}
                  >
                    {a.title}
                  </button>
                  : only {a.view.map((p) => (p.type === 'user' ? userById(p.id).name : p.name)).join(', ')} can view.
                </li>
              ))}
            </ul>
          </div>
        )}
        {setRestrictions.isError && (
          <p role="alert" className="t-ui-sm text-(--status-danger-text) mt-3">
            Couldn’t save the restrictions: {setRestrictions.error.message}
          </p>
        )}
      </section>
    </Modal>
  )
}

function RadioRow({ checked, onSelect, label }: { checked: boolean; onSelect: () => void; label: string }) {
  return (
    <label className="t-ui-md flex items-center gap-2 cursor-pointer">
      <input type="radio" name="share-scope" checked={checked} onChange={onSelect} className="accent-(--color-bg-accent)" />
      {label}
    </label>
  )
}
