import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { SPACE_GROUP_ID, effectivePermissions, useContentStore, useSpace } from '../store/contentStore'
import { useUIStore } from '../store/uiStore'
import { users } from '../data/mockData'
import { TEMPLATES } from '../data/templates'
import { SPACE_PERMISSIONS } from '../types'
import type { Space } from '../types'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { NotFound } from './NotFound'

type Tab = 'details' | 'permissions' | 'templates' | 'labels' | 'archive' | 'delete'

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'templates', label: 'Templates' },
  { id: 'labels', label: 'Labels' },
  { id: 'archive', label: 'Archive' },
  { id: 'delete', label: 'Delete space' },
]

export function SpaceSettings() {
  const { spaceId } = useParams()
  const space = useSpace(spaceId)
  const [tab, setTab] = useState<Tab>('details')

  if (!space) return <NotFound />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="t-content-h1 mb-1">Space settings</h1>
        <p className="t-ui-md text-(--color-text-secondary) mb-6">{space.name}</p>

        <div role="tablist" aria-label="Space settings" className="flex items-center gap-1 border-b border-(--color-border-default) mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                't-ui-md-medium h-10 px-3 border-b-2 -mb-px whitespace-nowrap',
                tab === t.id ? 'border-(--color-border-focus) text-(--color-text-link)' : 'border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)',
                t.id === 'delete' && tab !== t.id && 'text-(--status-danger-text)',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
          {tab === 'details' && <DetailsTab key={space.id} space={space} />}
          {tab === 'permissions' && <PermissionsTab space={space} />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'labels' && <LabelsTab space={space} />}
          {tab === 'archive' && <ArchiveTab space={space} />}
          {tab === 'delete' && <DeleteTab space={space} />}
        </div>
      </div>
    </div>
  )
}

const inputClass = 't-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)'

function DetailsTab({ space }: { space: Space }) {
  const updateSpace = useContentStore((s) => s.updateSpace)
  const pushToast = useUIStore((s) => s.pushToast)
  const [name, setName] = useState(space.name)
  const [key, setKey] = useState(space.key)
  const [description, setDescription] = useState(space.description)
  const dirty = name !== space.name || key !== space.key || description !== space.description
  const valid = name.trim() !== '' && /^[A-Z0-9]{2,10}$/.test(key)

  return (
    <form
      className="flex flex-col gap-4 max-w-[480px]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        updateSpace(space.id, { name: name.trim(), key, description })
        pushToast({ message: 'Space details saved', tone: 'success' })
      }}
    >
      <div>
        <label className="t-ui-md-medium block mb-1.5" htmlFor="space-name">
          Name
        </label>
        <input id="space-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="t-ui-md-medium block mb-1.5" htmlFor="space-key">
          Key
        </label>
        <input id="space-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} className={inputClass} aria-describedby="space-key-hint" />
        <p id="space-key-hint" className="t-ui-sm text-(--color-text-secondary) mt-1">
          2–10 letters or digits.
        </p>
      </div>
      <div>
        <label className="t-ui-md-medium block mb-1.5" htmlFor="space-description">
          Description
        </label>
        <textarea
          id="space-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
        />
      </div>
      <Button type="submit" variant="primary" className="self-start" disabled={!dirty || !valid}>
        Save changes
      </Button>
    </form>
  )
}

function PermissionsTab({ space }: { space: Space }) {
  const setSpacePermission = useContentStore((s) => s.setSpacePermission)
  const rows = [{ id: SPACE_GROUP_ID, name: 'All space members', user: undefined }, ...users.map((u) => ({ id: u.id, name: u.name, user: u }))]

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full t-ui-md">
        <thead>
          <tr>
            <th scope="col" className="text-left py-2 pr-4 sticky left-0 bg-(--color-bg-app)">
              Group / user
            </th>
            {SPACE_PERMISSIONS.map((p) => (
              <th key={p} scope="col" className="text-center py-2 px-3 t-ui-sm-medium text-(--color-text-secondary)">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const granted = effectivePermissions(space, row.id)
            const isOwner = row.id === space.ownerId
            return (
              <tr key={row.id} className="border-t border-(--color-border-default)">
                <th scope="row" className="py-2 pr-4 sticky left-0 bg-(--color-bg-app) font-normal text-left">
                  <span className="flex items-center gap-2">
                    {row.user ? <Avatar user={row.user} size={16} /> : <span className="w-4 h-4 rounded-(--radius-sm) bg-(--color-bg-sunken) inline-block" />}
                    {row.name}
                    {isOwner && <span className="t-ui-sm text-(--color-text-secondary)">(owner)</span>}
                  </span>
                </th>
                {SPACE_PERMISSIONS.map((p) => (
                  <td key={p} className="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      aria-label={`${p} for ${row.name}`}
                      checked={granted.includes(p)}
                      // The owner always keeps Admin, so a space can never be locked out.
                      disabled={isOwner && p === 'Admin'}
                      onChange={(e) => setSpacePermission(space.id, row.id, p, e.target.checked)}
                      className="accent-(--color-bg-accent)"
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TemplatesTab() {
  return (
    <ul className="flex flex-col gap-2 max-w-[560px]">
      {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
        <li key={t.id} className="p-3 rounded-(--radius-md) border border-(--color-border-default)">
          <p className="t-ui-md-medium">{t.name}</p>
          <p className="t-ui-sm text-(--color-text-secondary)">{t.description}</p>
        </li>
      ))}
    </ul>
  )
}

function LabelsTab({ space }: { space: Space }) {
  const navigate = useNavigate()
  const pages = useContentStore((s) => s.pages)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of Object.values(pages)) {
      if (p.spaceId !== space.id || p.state === 'deleted') continue
      for (const l of p.labels) map.set(l.name, (map.get(l.name) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [pages, space.id])

  if (counts.length === 0) return <p className="t-ui-md text-(--color-text-secondary)">No pages in this space have labels yet.</p>

  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(([name, count]) => (
        <button
          key={name}
          onClick={() => navigate(`/search?label=${encodeURIComponent(name)}`)}
          className="t-ui-sm px-2 h-6 inline-flex items-center gap-1.5 rounded-(--radius-sm) bg-(--color-bg-sunken) hover:bg-(--color-bg-hover)"
        >
          {name}
          <span className="text-(--color-text-secondary)">{count}</span>
        </button>
      ))}
    </div>
  )
}

function ArchiveTab({ space }: { space: Space }) {
  const setSpaceArchived = useContentStore((s) => s.setSpaceArchived)
  const pushToast = useUIStore((s) => s.pushToast)
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-(--radius-md) border border-(--color-border-default)">
      <div>
        <p className="t-ui-md-medium">{space.archived ? 'This space is archived' : 'Archive this space'}</p>
        <p className="t-ui-sm text-(--color-text-secondary)">
          {space.archived ? 'It is hidden from directories and menus. Restore it to make it active again.' : 'Hides it from directories. Content stays intact and can be restored.'}
        </p>
      </div>
      <Button
        variant="default"
        onClick={() => {
          setSpaceArchived(space.id, !space.archived)
          pushToast({ message: space.archived ? 'Space restored' : 'Space archived', tone: 'success' })
        }}
      >
        {space.archived ? 'Restore space' : 'Archive space'}
      </Button>
    </div>
  )
}

function DeleteTab({ space }: { space: Space }) {
  const navigate = useNavigate()
  const deleteSpace = useContentStore((s) => s.deleteSpace)
  const pushToast = useUIStore((s) => s.pushToast)
  const pageCount = useContentStore((s) => Object.values(s.pages).filter((p) => p.spaceId === space.id).length)
  const [confirmKey, setConfirmKey] = useState('')

  return (
    <div className="p-4 rounded-(--radius-md) border border-(--status-danger-bold)">
      <p className="t-ui-md-medium text-(--status-danger-text) mb-1">Delete space</p>
      <p className="t-ui-sm text-(--color-text-secondary) mb-3">
        This permanently deletes {pageCount} page{pageCount === 1 ? '' : 's'}. Type <strong>{space.key}</strong> to confirm.
      </p>
      <div className="flex gap-2">
        <input
          aria-label="Space key to confirm"
          value={confirmKey}
          onChange={(e) => setConfirmKey(e.target.value)}
          className="t-ui-md h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
        />
        <Button
          variant="danger"
          disabled={confirmKey !== space.key}
          onClick={() => {
            deleteSpace(space.id)
            navigate('/spaces')
            pushToast({ message: `Deleted ${space.name}`, tone: 'info' })
          }}
        >
          Delete space
        </Button>
      </div>
    </div>
  )
}
