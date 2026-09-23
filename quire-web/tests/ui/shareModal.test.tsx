import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { canEdit, useContentStore } from '../../src/store/contentStore'

const content = () => useContentStore.getState()

async function openShare(path = '/spaces/sp.eng/pages/pg.onboarding') {
  const r = renderApp(path)
  await r.user.click(screen.getAllByRole('button', { name: 'Share' })[0])
  return { ...r, dialog: screen.getByRole('dialog', { name: 'Share' }) }
}

describe('ShareModal (design.md §8.7)', () => {
  it('shows the real page link', async () => {
    const { dialog } = await openShare()
    expect(within(dialog).getByLabelText('Page link')).toHaveValue(`${window.location.origin}/spaces/sp.eng/pages/pg.onboarding`)
  })

  it('restricting to specific people is saved, marks the page and the tree, and always keeps you', async () => {
    const { user, dialog } = await openShare()
    await user.click(within(dialog).getByLabelText('Only specific people can view or edit'))
    await user.selectOptions(within(dialog).getByLabelText('Add a person'), 'u.adel')
    await user.selectOptions(within(dialog).getByLabelText('Role for Adel'), 'view')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    const page = content().pages['pg.onboarding']
    expect(page).toMatchObject({ restricted: true, viewerIds: ['u.daniel', 'u.adel'], editorIds: ['u.daniel'] })
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    const row = within(screen.getByRole('tree')).getByRole('treeitem', { name: 'Onboarding' })
    expect(row.querySelector('svg.lucide-lock')).not.toBeNull()
  })

  it('reopening starts from the saved restrictions; removing restrictions clears them', async () => {
    content().updatePageMeta('pg.onboarding', { restricted: true, viewerIds: ['u.daniel', 'u.priya'], editorIds: ['u.daniel', 'u.priya'] })
    const { user, dialog } = await openShare()
    expect(within(dialog).getByLabelText('Only specific people can view or edit')).toBeChecked()
    expect(within(dialog).getByLabelText('Role for Priya')).toHaveValue('edit')
    await user.click(within(dialog).getByLabelText('Anyone in space can view and edit'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(content().pages['pg.onboarding']).toMatchObject({ restricted: false, viewerIds: undefined, editorIds: undefined })
  })

  it('lists restrictions inherited from restricted ancestors with a link', async () => {
    const { user, dialog } = await openShare('/spaces/sp.eng/pages/pg.adr-012')
    expect(within(dialog).queryByText('Inherited restrictions')).not.toBeInTheDocument()
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!)

    content().updatePageMeta('pg.architecture', { restricted: true, viewerIds: ['u.daniel', 'u.marcus'] })
    await user.click(screen.getAllByRole('button', { name: 'Share' })[0])
    const reopened = screen.getByRole('dialog', { name: 'Share' })
    expect(within(reopened).getByText(/only Daniel, Marcus can view/)).toBeInTheDocument()
    await user.click(within(reopened).getByRole('button', { name: 'Architecture' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.architecture')
  })

  it('view-only users lose the Edit button and the editor route', () => {
    content().updatePageMeta('pg.onboarding', { restricted: true, viewerIds: undefined, editorIds: ['u.priya'] })
    expect(canEdit(content().pages['pg.onboarding'])).toBe(false)
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('the editor route shows a 403 for view-only users', async () => {
    content().updatePageMeta('pg.onboarding', { restricted: true, viewerIds: undefined, editorIds: ['u.priya'] })
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(await screen.findByRole('heading', { name: 'You don’t have permission to edit this page' })).toBeInTheDocument()
  })
})
