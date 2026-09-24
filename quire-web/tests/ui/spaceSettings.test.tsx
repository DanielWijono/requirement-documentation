import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../renderApp'
import { server } from '../fakeApi/server'
import { fakeDb } from '../fakeApi/db'
import { useContentStore } from '../../src/store/contentStore'

const content = () => useContentStore.getState()
const space = (id: string) => fakeDb.spaces.get(id)
const starred = (id: string) => fakeDb.spaceStars.has(`u.daniel:${id}`)
const watched = (id: string) => fakeDb.spaceWatches.has(`u.daniel:${id}`)

describe('space overview (design.md §8.3)', () => {
  it('shows live page counts and toggles Watch and Star', async () => {
    const { user } = renderApp('/spaces/sp.product')
    // Everyone in the workspace is in the members group, which can view the space.
    expect(screen.getByText(`PROD · 4 pages · ${fakeDb.activeUserIds().length} members`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Watch' }))
    // The button flips at once; the server catches up.
    expect(screen.getByRole('button', { name: 'Watching' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(watched('sp.product')).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Star' }))
    await waitFor(() => expect(starred('sp.product')).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'Starred', pressed: true }))
    await waitFor(() => expect(starred('sp.product')).toBe(false))
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
    expect(await screen.findByText('Space details saved')).toBeInTheDocument()
    expect(space('sp.product')).toMatchObject({ name: 'Product team', key: 'XPT' })
  })

  it('explains a key that another space already uses', async () => {
    const { user } = renderApp('/spaces/sp.product/settings')
    await user.clear(screen.getByLabelText('Key'))
    await user.type(screen.getByLabelText('Key'), 'ENG')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another space already uses that key.')
    expect(space('sp.product')?.key).toBe('PROD')
  })

  it('permission matrix toggles persist and the owner keeps Admin', async () => {
    const { user } = renderApp('/spaces/sp.eng/settings')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    const box = await screen.findByRole('checkbox', { name: 'Delete for Adel' })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Edit for All space members' })).toBeChecked()
    await user.click(box)
    expect(box).toBeChecked()
    await waitFor(() => expect(space('sp.eng')?.grants.find((g) => g.principalId === 'u.adel')?.perms).toEqual(['Delete']))
    expect(screen.getByRole('checkbox', { name: 'Admin for Daniel' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Edit for All space members' }))
    await waitFor(() => expect(space('sp.eng')?.grants.find((g) => g.principalId === 'group.members')?.perms).toEqual(['View', 'Add', 'Comment']))
  })

  it('only shows the matrix to space admins', async () => {
    // Priya owns Product; Daniel is a site admin, so demote him to see what a member sees.
    fakeDb.users.get('u.daniel')!.siteRole = 'member'
    const { user } = renderApp('/spaces/sp.product/settings')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    expect(screen.getByText('Only space admins can see and change who has access.')).toBeInTheDocument()
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
    expect(await screen.findByText('Space archived')).toBeInTheDocument()
    expect(space('sp.people')?.archived).toBe(true)
    await user.click(await screen.findByRole('button', { name: 'Restore space' }))
    await waitFor(() => expect(space('sp.people')?.archived).toBe(false))
  })

  it('deletes the space only after typing its key', async () => {
    const { user } = renderApp('/spaces/sp.people/settings')
    await user.click(screen.getByRole('tab', { name: 'Delete space' }))
    const del = within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Delete space' })
    expect(del).toBeDisabled()
    await user.type(screen.getByLabelText('Space key to confirm'), 'PEOPLE')
    await user.click(del)
    await waitFor(() => expect(window.location.pathname).toBe('/spaces'))
    expect(space('sp.people')).toBeUndefined()
    expect(content().pages['pg.benefits']).toBeUndefined()
    expect(screen.queryByText('People')).not.toBeInTheDocument()
  })
})

describe('loading spaces from the API', () => {
  it('shows a skeleton, not Not found, while spaces load', async () => {
    renderApp('/spaces/sp.eng/settings', { prefetch: false })
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Space settings' })).toBeInTheDocument()
  })

  it('offers a retry when spaces fail to load', async () => {
    server.use(http.get('*/api/spaces', () => HttpResponse.json({ code: 'internal', message: 'Something went wrong' }, { status: 500 })))
    const { user } = renderApp('/spaces/sp.eng/settings', { prefetch: false })
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this space' })).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Space settings' })).toBeInTheDocument()
  })

  it('still says Not found for a space nobody can see', async () => {
    renderApp('/spaces/sp.nope', { prefetch: false })
    expect(await screen.findByText(/not found|doesn’t exist|can’t find/i)).toBeInTheDocument()
  })
})
