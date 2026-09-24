import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { fakeDb } from '../fakeApi/db'

const pendingInvites = () => [...fakeDb.invites.values()].filter((i) => !i.acceptedAt)
const groupNamed = (name: string) => [...fakeDb.groups.values()].find((g) => g.name === name)

describe('People admin', () => {
  it('is in the account menu for site admins', async () => {
    const { user } = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'People' }))
    expect(window.location.pathname).toBe('/admin/people')
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument()
  })

  it('is not for members', async () => {
    fakeDb.users.get('u.daniel')!.siteRole = 'member'
    const { user, queryClient } = renderApp('/admin/people')
    queryClient.setQueryData(['session'], fakeDb.userDto('u.daniel'))
    expect(await screen.findByText('Only site admins can manage people')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.queryByRole('menuitem', { name: 'People' })).not.toBeInTheDocument()
  })

  it('sends, lists and revokes invites', async () => {
    const { user } = renderApp('/admin/people')
    await user.type(screen.getByLabelText('Email'), 'nia@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Invite sent to nia@example.com')).toBeInTheDocument()
    expect(pendingInvites()).toEqual([expect.objectContaining({ email: 'nia@example.com', siteRole: 'admin' })])
    expect(fakeDb.mail.at(-1)?.to).toBe('nia@example.com')

    const pending = (await screen.findByText('nia@example.com')).closest('li')!
    await user.click(within(pending).getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText('No invites waiting to be accepted.')).toBeInTheDocument()
    expect(pendingInvites()).toEqual([])
  })

  it('explains inviting someone who already has an account', async () => {
    const { user } = renderApp('/admin/people')
    await user.type(screen.getByLabelText('Email'), fakeDb.users.get('u.priya')!.email)
    await user.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That person already has an account.')
  })

  it('changes roles and deactivates people, but not yourself', async () => {
    const { user } = renderApp('/admin/people')
    expect(await screen.findByLabelText('Role for Daniel')).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Role for Priya'), 'admin')
    await waitFor(() => expect(fakeDb.users.get('u.priya')!.siteRole).toBe('admin'))

    const row = screen.getByText('Priya').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }))
    expect(await screen.findByText('Priya is deactivated and signed out')).toBeInTheDocument()
    expect(fakeDb.users.get('u.priya')!.deactivated).toBe(true)
    await user.click(await within(row).findByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(fakeDb.users.get('u.priya')!.deactivated).toBe(false))
    expect(within(screen.getByText('Daniel').closest('li')!).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  })

  it('creates a group, fills it, renames it and deletes it', async () => {
    const { user } = renderApp('/admin/people')
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    await user.type(screen.getByLabelText('New group name'), 'Design')
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Create' }))
    const editor = await screen.findByRole('region', { name: 'Group Design' })
    expect(within(editor).getByText('No members yet.')).toBeInTheDocument()

    await user.selectOptions(within(editor).getByLabelText('Add a member'), 'u.adel')
    expect(await within(editor).findByRole('button', { name: 'Remove Adel' })).toBeInTheDocument()
    expect(groupNamed('Design')!.memberIds).toEqual(['u.adel'])
    await user.click(within(editor).getByRole('button', { name: 'Remove Adel' }))
    await waitFor(() => expect(groupNamed('Design')!.memberIds).toEqual([]))

    await user.clear(within(editor).getByLabelText('Name'))
    await user.type(within(editor).getByLabelText('Name'), 'Design team')
    await user.click(within(editor).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(groupNamed('Design team')).toBeDefined())

    await user.click(within(await screen.findByRole('region', { name: 'Group Design team' })).getByRole('button', { name: 'Delete group' }))
    expect(await screen.findByText('Deleted Design team')).toBeInTheDocument()
    expect(groupNamed('Design team')).toBeUndefined()
  })

  it('shows the members group as automatic', async () => {
    const { user } = renderApp('/admin/people')
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    await user.click(await screen.findByRole('button', { name: /All members/ }))
    const editor = await screen.findByRole('region', { name: 'Group All members' })
    expect(within(editor).getByText(/in this group automatically/)).toBeInTheDocument()
    expect(within(editor).queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument()
    expect(within(editor).queryByLabelText('Add a member')).not.toBeInTheDocument()
  })
})
