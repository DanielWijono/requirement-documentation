import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { useContentStore } from '../../src/store/contentStore'

const content = () => useContentStore.getState()
const space = (id: string) => content().spaces.find((s) => s.id === id)

describe('space overview (design.md §8.3)', () => {
  it('shows live page counts and toggles Watch and Star', async () => {
    const { user } = renderApp('/spaces/sp.product')
    expect(screen.getByText(/PROD · 4 pages · 9 members/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Watch' }))
    expect(space('sp.product')?.watched).toBe(true)
    expect(screen.getByRole('button', { name: 'Watching' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Star' }))
    expect(space('sp.product')?.starred).toBe(true)
  })
})

describe('space settings (design.md §8.8)', () => {
  it('saves details and validates the key', async () => {
    const { user } = renderApp('/spaces/sp.product/settings')
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Product team')
    await user.clear(screen.getByLabelText('Key'))
    await user.type(screen.getByLabelText('Key'), 'x')
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Key'), 'pt')
    await user.click(save)
    expect(space('sp.product')).toMatchObject({ name: 'Product team', key: 'XPT' })
  })

  it('permission matrix toggles persist and the owner keeps Admin', async () => {
    const { user } = renderApp('/spaces/sp.eng/settings')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    const box = screen.getByRole('checkbox', { name: 'Delete for Adel' })
    expect(box).not.toBeChecked()
    await user.click(box)
    expect(space('sp.eng')?.permissions?.['u.adel']).toContain('Delete')
    expect(screen.getByRole('checkbox', { name: 'Admin for Daniel' })).toBeDisabled()
  })

  it('labels tab counts labels used in the space and links to search', async () => {
    const { user } = renderApp('/spaces/sp.eng/settings')
    await user.click(screen.getByRole('tab', { name: 'Labels' }))
    await user.click(screen.getByRole('button', { name: /payments/ }))
    expect(window.location.search).toBe('?label=payments')
    expect(within(screen.getByRole('group', { name: 'Labels' })).getByRole('button', { name: 'payments' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('archives and restores the space', async () => {
    const { user } = renderApp('/spaces/sp.people/settings')
    await user.click(screen.getByRole('tab', { name: 'Archive' }))
    await user.click(screen.getByRole('button', { name: 'Archive space' }))
    expect(space('sp.people')?.archived).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Restore space' }))
    expect(space('sp.people')?.archived).toBe(false)
  })

  it('deletes the space only after typing its key', async () => {
    const { user } = renderApp('/spaces/sp.people/settings')
    await user.click(screen.getByRole('tab', { name: 'Delete space' }))
    const del = within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Delete space' })
    expect(del).toBeDisabled()
    await user.type(screen.getByLabelText('Space key to confirm'), 'PEOPLE')
    await user.click(del)
    expect(window.location.pathname).toBe('/spaces')
    expect(space('sp.people')).toBeUndefined()
    expect(content().pages['pg.benefits']).toBeUndefined()
  })
})
