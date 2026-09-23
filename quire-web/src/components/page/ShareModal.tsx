import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useUIStore } from '../../store/uiStore'
import { ancestorChainIn, useContentStore, usePageTree } from '../../store/contentStore'
import { currentUser, userById, users } from '../../data/mockData'
import { pageUrl } from './usePageActions'
import type { Page } from '../../types'

type Scope = 'anyone-space' | 'anyone-view-some-edit' | 'specific'
type Role = 'view' | 'edit'

function initialScope(page: Page): Scope {
  if (!page.restricted) return 'anyone-space'
  return page.viewerIds ? 'specific' : 'anyone-view-some-edit'
}

/** People listed on the page (other than you), with the role each one has. */
function initialPeople(page: Page): { id: string; role: Role }[] {
  const ids = new Set([...(page.viewerIds ?? []), ...(page.editorIds ?? [])])
  ids.delete(currentUser.id)
  return [...ids].map((id) => ({ id, role: !page.editorIds || page.editorIds.includes(id) ? 'edit' : 'view' }))
}

export function ShareModal({ page, open, onClose }: { page: Page; open: boolean; onClose: () => void }) {
  // Mount the body only while open so it always starts from the saved restrictions.
  return open ? <ShareModalBody page={page} onClose={onClose} /> : null
}

function ShareModalBody({ page, onClose }: { page: Page; onClose: () => void }) {
  const navigate = useNavigate()
  const updatePageMeta = useContentStore((s) => s.updatePageMeta)
  const pages = useContentStore((s) => s.pages)
  const tree = usePageTree(page.spaceId)
  const pushToast = useUIStore((s) => s.pushToast)
  const [scope, setScope] = useState<Scope>(initialScope(page))
  const [people, setPeople] = useState(initialPeople(page))
  const url = pageUrl(page)

  const inherited = ancestorChainIn(tree, page.id)
    .slice(0, -1)
    .map((n) => pages[n.id])
    .filter((p): p is Page => Boolean(p?.restricted))

  function save() {
    // You always keep access to a page you restrict, so you cannot lock yourself out.
    const listed = [currentUser.id, ...people.map((p) => p.id)]
    const editors = [currentUser.id, ...people.filter((p) => p.role === 'edit').map((p) => p.id)]
    if (scope === 'anyone-space') updatePageMeta(page.id, { restricted: false, viewerIds: undefined, editorIds: undefined })
    else if (scope === 'anyone-view-some-edit') updatePageMeta(page.id, { restricted: true, viewerIds: undefined, editorIds: editors })
    else updatePageMeta(page.id, { restricted: true, viewerIds: listed, editorIds: editors })
    onClose()
    pushToast({ message: 'Restrictions updated', tone: 'success' })
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
          <Button variant="primary" onClick={save}>
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
        <fieldset>
          <legend className="t-ui-md-medium mb-2">Restrictions</legend>
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

        {inherited.length > 0 && (
          <div className="mt-4">
            <p className="t-ui-sm-medium text-(--color-text-secondary) mb-1">Inherited restrictions</p>
            <ul className="t-ui-sm text-(--color-text-secondary) flex flex-col gap-1">
              {inherited.map((a) => (
                <li key={a.id}>
                  From{' '}
                  <button
                    className="text-(--color-text-link) underline"
                    onClick={() => {
                      onClose()
                      navigate(`/spaces/${a.spaceId}/pages/${a.id}`)
                    }}
                  >
                    {a.title}
                  </button>
                  : {a.viewerIds ? `only ${a.viewerIds.map((id) => userById(id).name).join(', ')} can view` : 'some people can’t edit'}.
                </li>
              ))}
            </ul>
          </div>
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
