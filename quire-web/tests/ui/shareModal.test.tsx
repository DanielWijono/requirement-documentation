import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { fakeDb, type FakeRestriction } from '../fakeApi/db'

const fakePage = (id: string) => fakeDb.pages.get(id)!
const user = (kind: 'view' | 'edit', principalId: string): FakeRestriction => ({ kind, principalType: 'user', principalId })

async function openShare(path = '/spaces/sp.eng/pages/pg.onboarding') {
  const r = renderApp(path)
  await r.user.click(screen.getAllByRole('button', { name: 'Share' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Share' })
  // Restrictions load from the server when the dialog opens.
  await within(dialog).findByLabelText('Anyone in space can view and edit')
  return { ...r, dialog: screen.getByRole('dialog', { name: 'Share' }) }
}

describe('ShareModal (design.md §8.7)', () => {
  it('shows the real page link', async () => {
    const { dialog } = await openShare()
    expect(within(dialog).getByLabelText('Page link')).toHaveValue(`${window.location.origin}/spaces/sp.eng/pages/pg.onboarding`)
  })

  it('restricting to specific people is saved, marks the page and the tree, and always keeps you', async () => {
    const { user: u, dialog } = await openShare()
    await u.click(within(dialog).getByLabelText('Only specific people can view or edit'))
    await u.selectOptions(within(dialog).getByLabelText('Add a person'), 'u.adel')
    await u.selectOptions(within(dialog).getByLabelText('Role for Adel'), 'view')
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Restricted')).toBeInTheDocument()
    expect(fakePage('pg.onboarding').restrictions).toEqual(
      expect.arrayContaining([user('view', 'u.daniel'), user('view', 'u.adel'), user('edit', 'u.daniel')]),
    )
    expect(fakePage('pg.onboarding').restrictions).toHaveLength(3)
    await waitFor(() => {
      const row = within(screen.getByRole('tree')).getByRole('treeitem', { name: 'Onboarding' })
      expect(row.querySelector('svg.lucide-lock')).not.toBeNull()
    })
  })

  it('reopening starts from the saved restrictions; removing restrictions clears them', async () => {
    fakePage('pg.onboarding').restrictions = [user('view', 'u.daniel'), user('view', 'u.priya'), user('edit', 'u.daniel'), user('edit', 'u.priya')]
    const { user: u, dialog } = await openShare()
    expect(within(dialog).getByLabelText('Only specific people can view or edit')).toBeChecked()
    expect(within(dialog).getByLabelText('Role for Priya')).toHaveValue('edit')
    await u.click(within(dialog).getByLabelText('Anyone in space can view and edit'))
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakePage('pg.onboarding').restrictions).toEqual([]))
  })

  it('lists restrictions inherited from restricted ancestors with a link', async () => {
    const plain = await openShare('/spaces/sp.eng/pages/pg.adr-012')
    expect(within(plain.dialog).queryByText('Inherited restrictions')).not.toBeInTheDocument()
    plain.unmount()

    fakePage('pg.architecture').restrictions = [user('view', 'u.daniel'), user('view', 'u.marcus')]
    const { user: u, dialog } = await openShare('/spaces/sp.eng/pages/pg.adr-012')
    expect(within(dialog).getByText(/only Daniel, Marcus can view/)).toBeInTheDocument()
    await u.click(within(dialog).getByRole('button', { name: 'Architecture' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.architecture')
  })

  it('shows a save failure without closing', async () => {
    const { user: u, dialog } = await openShare()
    await u.click(within(dialog).getByLabelText('Only specific people can view or edit'))
    await u.selectOptions(within(dialog).getByLabelText('Add a person'), 'u.adel')
    fakeDb.users.delete('u.adel')
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t save the restrictions')
  })

  it('view-only users lose the Edit button', () => {
    fakePage('pg.onboarding').restrictions = [user('edit', 'u.priya')]
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    expect(screen.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('the editor route shows a 403 for view-only users', async () => {
    fakePage('pg.onboarding').restrictions = [user('edit', 'u.priya')]
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(await screen.findByRole('heading', { name: 'You don’t have permission to edit this page' })).toBeInTheDocument()
  })
})
