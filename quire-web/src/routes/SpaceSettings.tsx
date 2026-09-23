import { useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useSpace } from '../store/contentStore'
import { users } from '../data/mockData'
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

const PERMISSIONS = ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin'] as const

export function SpaceSettings() {
  const { spaceId } = useParams()
  const space = useSpace(spaceId)
  const [tab, setTab] = useState<Tab>('details')
  const [confirmKey, setConfirmKey] = useState('')

  if (!space) return <NotFound />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-6 py-8">
        <h1 className="t-content-h1 mb-1">Space settings</h1>
        <p className="t-ui-md text-(--color-text-secondary) mb-6">{space.name}</p>

        <div className="flex items-center gap-1 border-b border-(--color-border-default) mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
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

        {tab === 'details' && (
          <div className="flex flex-col gap-4 max-w-[480px]">
            <Field label="Name" defaultValue={space.name} />
            <Field label="Key" defaultValue={space.key} />
            <div>
              <label className="t-ui-md-medium block mb-1.5">Description</label>
              <textarea
                defaultValue={space.description}
                rows={3}
                className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
              />
            </div>
            <Button variant="primary" className="self-start">
              Save changes
            </Button>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="overflow-x-auto">
            <table className="min-w-full t-ui-md">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 sticky left-0 bg-(--color-bg-app)">Group / user</th>
                  {PERMISSIONS.map((p) => (
                    <th key={p} className="text-center py-2 px-3 t-ui-sm-medium text-(--color-text-secondary)">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[{ name: 'Engineering team', kind: 'group' }, ...users.slice(0, 3).map((u) => ({ name: u.name, kind: 'user' as const, user: u }))].map((row) => (
                  <tr key={row.name} className="border-t border-(--color-border-default)">
                    <td className="py-2 pr-4 sticky left-0 bg-(--color-bg-app) flex items-center gap-2">
                      {'user' in row ? <Avatar user={row.user} size={16} /> : <span className="w-5 h-5 rounded-(--radius-sm) bg-(--color-bg-sunken) inline-block" />}
                      {row.name}
                    </td>
                    {PERMISSIONS.map((p) => (
                      <td key={p} className="text-center py-2 px-3">
                        <input type="checkbox" defaultChecked={p === 'View' || p === 'Comment'} className="accent-(--color-bg-accent)" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'templates' && (
          <p className="t-ui-md text-(--color-text-secondary)">Templates scoped to this space will appear here.</p>
        )}

        {tab === 'labels' && (
          <div className="flex flex-wrap gap-2">
            {['architecture', 'payments', 'onboarding', 'oncall'].map((l) => (
              <span key={l} className="t-ui-sm px-2 h-6 inline-flex items-center rounded-(--radius-sm) bg-(--color-bg-sunken)">
                {l}
              </span>
            ))}
          </div>
        )}

        {tab === 'archive' && (
          <div className="flex items-center justify-between p-4 rounded-(--radius-md) border border-(--color-border-default)">
            <div>
              <p className="t-ui-md-medium">Archive this space</p>
              <p className="t-ui-sm text-(--color-text-secondary)">Hides it from directories. Content stays intact and can be restored.</p>
            </div>
            <Button variant="default">Archive space</Button>
          </div>
        )}

        {tab === 'delete' && (
          <div className="p-4 rounded-(--radius-md) border border-(--status-danger-bold)">
            <p className="t-ui-md-medium text-(--status-danger-text) mb-1">Delete space</p>
            <p className="t-ui-sm text-(--color-text-secondary) mb-3">
              This permanently deletes {space.pageCount} pages. Type <strong>{space.key}</strong> to confirm.
            </p>
            <div className="flex gap-2">
              <input
                value={confirmKey}
                onChange={(e) => setConfirmKey(e.target.value)}
                className="t-ui-md h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
              />
              <Button variant="danger" disabled={confirmKey !== space.key}>
                Delete space
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div>
      <label className="t-ui-md-medium block mb-1.5">{label}</label>
      <input defaultValue={defaultValue} className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)" />
    </div>
  )
}
