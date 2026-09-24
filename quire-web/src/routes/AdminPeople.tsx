import { MEMBERS_GROUP_ID, type SiteRole } from '@quire/shared'
import clsx from 'clsx'
import { useState, type FormEvent } from 'react'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { useCurrentUser } from '../hooks/useSession'
import { ApiError } from '../lib/apiClient'
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupDetail,
  useInvites,
  usePeople,
  useRenameGroup,
  useRevokeInvite,
  useSendInvite,
  useSetGroupMembers,
  useUpdatePerson,
} from '../queries/admin'
import { useGroups } from '../queries/users'
import { useUIStore } from '../store/uiStore'

type Tab = 'people' | 'groups'
const inputClass = 't-ui-md h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)'

function explain(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return fallback
  if (err.code === 'already_member') return 'That person already has an account.'
  if (err.code === 'name_taken') return 'Another group already has that name.'
  return err.message
}

/** Site administration (admins only): invite people, change roles, deactivate accounts, manage groups. */
export function AdminPeople() {
  const me = useCurrentUser()
  const [tab, setTab] = useState<Tab>('people')

  if (me.siteRole !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <h1 className="t-content-h2">Only site admins can manage people</h1>
        <p className="t-ui-md text-(--color-text-secondary)">Ask a site admin to invite someone or change their access.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="t-content-h1 mb-6">People</h1>
        <div role="tablist" aria-label="People settings" className="flex items-center gap-1 border-b border-(--color-border-default) mb-6">
          {(['people', 'groups'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx(
                't-ui-md-medium h-10 px-3 border-b-2 -mb-px',
                tab === t ? 'border-(--color-border-focus) text-(--color-text-link)' : 'border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)',
              )}
            >
              {t === 'people' ? 'People and invites' : 'Groups'}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab === 'people' ? 'People and invites' : 'Groups'}>
          {tab === 'people' ? <PeopleTab /> : <GroupsTab />}
        </div>
      </div>
    </div>
  )
}

function PeopleTab() {
  const me = useCurrentUser()
  const people = usePeople()
  const invites = useInvites()
  const sendInvite = useSendInvite()
  const revoke = useRevokeInvite()
  const updatePerson = useUpdatePerson()
  const pushToast = useUIStore((s) => s.pushToast)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<SiteRole>('member')

  function invite(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    sendInvite.mutate(
      { email: email.trim(), siteRole: role },
      {
        onSuccess: (inv) => {
          pushToast({ message: `Invite sent to ${inv.email}`, tone: 'success' })
          setEmail('')
          setRole('member')
        },
      },
    )
  }

  const failed = (what: string) => (err: Error) => pushToast({ message: `Couldn’t ${what}: ${explain(err, err.message)}`, tone: 'danger' })

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="t-content-h3 mb-2">
          Invite someone
        </h2>
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 grow min-w-[220px]">
            <span className="t-ui-sm-medium">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@example.com" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-ui-sm-medium">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as SiteRole)} className={inputClass}>
              <option value="member">Member</option>
              <option value="admin">Site admin</option>
            </select>
          </label>
          <Button type="submit" variant="primary" loading={sendInvite.isPending} disabled={!email.trim()}>
            Send invite
          </Button>
        </form>
        {sendInvite.isError && (
          <p role="alert" className="t-ui-sm text-(--status-danger-text) mt-2">
            {explain(sendInvite.error, 'Couldn’t send the invite.')}
          </p>
        )}
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="t-content-h3 mb-2">
          Pending invites
        </h2>
        {invites.isPending ? (
          <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
        ) : (invites.data ?? []).length === 0 ? (
          <p className="t-ui-md text-(--color-text-secondary)">No invites waiting to be accepted.</p>
        ) : (
          <ul className="rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default)">
            {invites.data!.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 h-12 t-ui-md">
                <span className="grow truncate">{inv.email}</span>
                <span className="t-ui-sm text-(--color-text-secondary)">{inv.siteRole === 'admin' ? 'Site admin' : 'Member'}</span>
                <span className="t-ui-sm text-(--color-text-secondary) hidden sm:inline">Invited by {inv.invitedBy}</span>
                <Button size="compact" onClick={() => revoke.mutate(inv.id, { onError: failed('revoke the invite') })}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="t-content-h3 mb-2">
          Everyone
        </h2>
        {people.isPending ? (
          <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
        ) : (
          <ul className="rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default)">
            {(people.data ?? []).map((p) => {
              const self = p.id === me.id
              return (
                <li key={p.id} className={clsx('flex flex-wrap items-center gap-3 px-4 py-2 t-ui-md', p.deactivated && 'opacity-60')}>
                  <Avatar user={p} size={24} />
                  <span className="grow min-w-0">
                    <span className="block truncate">
                      {p.name}
                      {self && <span className="text-(--color-text-secondary)"> (you)</span>}
                    </span>
                    <span className="block t-ui-sm text-(--color-text-secondary) truncate">{p.email}</span>
                  </span>
                  {p.deactivated && <span className="t-ui-sm text-(--color-text-secondary)">Deactivated</span>}
                  <select
                    aria-label={`Role for ${p.name}`}
                    value={p.siteRole}
                    // You can't demote yourself: the workspace must keep an admin.
                    disabled={self}
                    onChange={(e) => updatePerson.mutate({ id: p.id, patch: { siteRole: e.target.value as SiteRole } }, { onError: failed('change the role') })}
                    className={inputClass}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Site admin</option>
                  </select>
                  {!self && (
                    <Button
                      size="compact"
                      variant={p.deactivated ? 'default' : 'danger'}
                      onClick={() =>
                        updatePerson.mutate(
                          { id: p.id, patch: { deactivated: !p.deactivated } },
                          {
                            onSuccess: () => pushToast({ message: p.deactivated ? `${p.name} can sign in again` : `${p.name} is deactivated and signed out`, tone: 'info' }),
                            onError: failed(p.deactivated ? 'reactivate them' : 'deactivate them'),
                          },
                        )
                      }
                    >
                      {p.deactivated ? 'Reactivate' : 'Deactivate'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function GroupsTab() {
  const groups = useGroups()
  const createGroup = useCreateGroup()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const pushToast = useUIStore((s) => s.pushToast)

  function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createGroup.mutate(
      { name: name.trim() },
      {
        onSuccess: (g) => {
          setName('')
          setSelected(g.id)
          pushToast({ message: `Created ${g.name}`, tone: 'success' })
        },
      },
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-3">
        <form onSubmit={create} className="flex gap-2">
          <input aria-label="New group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New group" className={clsx(inputClass, 'grow min-w-0')} />
          <Button type="submit" variant="primary" disabled={!name.trim()} loading={createGroup.isPending}>
            Create
          </Button>
        </form>
        {createGroup.isError && (
          <p role="alert" className="t-ui-sm text-(--status-danger-text)">
            {explain(createGroup.error, 'Couldn’t create the group.')}
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {(groups.data ?? []).map((g) => (
            <li key={g.id}>
              <button
                onClick={() => setSelected(g.id)}
                aria-pressed={selected === g.id}
                className={clsx(
                  't-ui-md w-full flex items-center justify-between px-2 h-8 rounded-(--radius-sm) text-left',
                  selected === g.id ? 'bg-(--color-bg-selected) text-(--color-text-link)' : 'hover:bg-(--color-bg-hover)',
                )}
              >
                <span className="truncate">{g.name}</span>
                <span className="t-ui-sm text-(--color-text-secondary)">{g.memberCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected ? <GroupEditor key={selected} groupId={selected} onDeleted={() => setSelected(null)} /> : <p className="t-ui-md text-(--color-text-secondary)">Choose a group to see and change its members.</p>}
    </div>
  )
}

function GroupEditor({ groupId, onDeleted }: { groupId: string; onDeleted: () => void }) {
  const group = useGroupDetail(groupId)
  const people = usePeople()
  const rename = useRenameGroup()
  const remove = useDeleteGroup()
  const setMembers = useSetGroupMembers()
  const pushToast = useUIStore((s) => s.pushToast)
  const [name, setName] = useState<string | null>(null)

  if (group.isPending) return <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
  if (group.isError) return <p role="alert" className="t-ui-md text-(--status-danger-text)">Couldn’t load the group.</p>
  const g = group.data
  const system = g.id === MEMBERS_GROUP_ID || g.isSystem
  const memberIds = g.members.map((m) => m.id)
  const failed = (what: string) => (err: Error) => pushToast({ message: `Couldn’t ${what}: ${explain(err, err.message)}`, tone: 'danger' })
  const change = (userIds: string[]) => setMembers.mutate({ id: g.id, userIds }, { onError: failed('change the members') })

  return (
    <section aria-label={`Group ${g.name}`} className="flex flex-col gap-4">
      {system ? (
        <div>
          <h2 className="t-content-h3">{g.name}</h2>
          <p className="t-ui-sm text-(--color-text-secondary)">Everyone with an active account is in this group automatically.</p>
        </div>
      ) : (
        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (name?.trim()) rename.mutate({ id: g.id, name: name.trim() }, { onSuccess: () => setName(null), onError: failed('rename the group') })
          }}
        >
          <label className="flex flex-col gap-1 grow">
            <span className="t-ui-sm-medium">Name</span>
            <input value={name ?? g.name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <Button type="submit" disabled={!name?.trim() || name.trim() === g.name} loading={rename.isPending}>
            Rename
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              remove.mutate(g.id, {
                onSuccess: () => {
                  pushToast({ message: `Deleted ${g.name}`, tone: 'info' })
                  onDeleted()
                },
                onError: failed('delete the group'),
              })
            }
          >
            Delete group
          </Button>
        </form>
      )}

      <ul className="rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default)">
        {g.members.length === 0 && <li className="px-4 h-10 flex items-center t-ui-md text-(--color-text-secondary)">No members yet.</li>}
        {g.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-4 h-10 t-ui-md">
            <Avatar user={m} size={16} />
            <span className="grow truncate">{m.name}</span>
            {!system && (
              <button className="t-ui-sm text-(--color-text-link) underline" onClick={() => change(memberIds.filter((id) => id !== m.id))}>
                Remove {m.name}
              </button>
            )}
          </li>
        ))}
      </ul>

      {!system && (
        <select
          aria-label="Add a member"
          value=""
          onChange={(e) => e.target.value && change([...memberIds, e.target.value])}
          className={inputClass}
        >
          <option value="">Add a member…</option>
          {(people.data ?? [])
            .filter((p) => !p.deactivated && !memberIds.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      )}
      <p className="t-ui-sm text-(--color-text-secondary)">Give a group access to a space in that space’s Permissions settings.</p>
    </section>
  )
}
