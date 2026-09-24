import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { fakeDb } from '../fakeApi/db'

const fakePage = (id: string) => fakeDb.pages.get(id)!

describe('page state model (design.md §7)', () => {
  it('draft pages show a Draft lozenge next to the title', () => {
    renderApp('/spaces/sp.eng/pages/pg.new-draft')
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText(/Only you and collaborators can see this page/)).toBeInTheDocument()
  })

  it('published pages show no Draft lozenge', () => {
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('tree marks pages with unpublished changes with a dot', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    const row = within(nav).getByText('ADR-012: Queueing strategy for payment events').closest('[role="treeitem"]') as HTMLElement
    expect(within(row).getByRole('img', { name: 'Unpublished changes' })).toBeInTheDocument()
  })

  it('archive view lists archived pages and restores them', async () => {
    Object.assign(fakePage('pg.deploys'), { status: 'archived', statusBeforeTrash: 'draft' })
    const { user } = renderApp('/spaces/sp.eng')
    await user.click(screen.getByRole('button', { name: 'Archived pages' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/archive')
    const list = await screen.findByRole('list')
    expect(within(list).getByText('Untitled')).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Nothing is archived in this space.')).toBeInTheDocument()
    expect(fakePage('pg.deploys').status).toBe('draft')
  })

  it('archived seed pages are not in the tree but are in the archive view', async () => {
    renderApp('/spaces/sp.legacy/archive')
    expect(await screen.findByText('Old API reference')).toBeInTheDocument()
    expect(screen.getByText('This space has no pages yet')).toBeInTheDocument()
  })

  it('archived pages dim images only', () => {
    Object.assign(fakePage('pg.onboarding'), { publishedHtml: '<p>Text</p><img src="x.png" alt="diagram">', draft: null, status: 'archived', statusBeforeTrash: 'published' })
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    const body = screen.getByAltText('diagram').closest('.prose') as HTMLElement
    expect(body.className).toContain('[&_img]:opacity-70')
  })
})

describe('403 vs 404', () => {
  it('restricted pages the user cannot view show a 403 that never reveals the title', async () => {
    renderApp('/spaces/sp.people/pages/pg.benefits')
    expect(await screen.findByRole('heading', { name: /don’t have permission/ })).toBeInTheDocument()
    // The API says nothing about a page you can't see, not even who owns it.
    expect(screen.getByText(/Ask whoever shared it with you, or a space admin/)).toBeInTheDocument()
    expect(screen.queryByText(/Wren/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Benefits' })).not.toBeInTheDocument()
    expect(screen.queryByText(/plan details/)).not.toBeInTheDocument()
  })

  it('the editor route is also forbidden, and the view is not recorded', async () => {
    renderApp('/spaces/sp.people/pages/pg.benefits/edit')
    expect(await screen.findByRole('heading', { name: /don’t have permission/ })).toBeInTheDocument()
    expect(fakeDb.recentViews.has('u.daniel:pg.benefits')).toBe(false)
  })

  it('pages you can view but not edit name their owner on the edit route', async () => {
    fakePage('pg.onboarding').restrictions = [{ kind: 'edit', principalType: 'user', principalId: 'u.priya' }]
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(await screen.findByRole('heading', { name: 'You don’t have permission to edit this page' })).toBeInTheDocument()
    expect(screen.getByText(/Ask the owner, .+, or a space admin for access/)).toBeInTheDocument()
  })

  it('restricted pages the user can view render normally with the Restricted lozenge', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(screen.getByText('Restricted')).toBeInTheDocument()
  })

  it('unknown pages still show the 404', async () => {
    renderApp('/spaces/sp.people/pages/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('forbidden pages are hidden from search', async () => {
    const { user } = renderApp('/search')
    await user.type(screen.getByPlaceholderText('Search this site'), 'Benefits')
    // Other pages mention benefits; wait for the server's answer, then check the restricted page isn't in it.
    await waitFor(() => expect(screen.getByLabelText('Search this site')).toHaveValue('Benefits'))
    await waitFor(() => expect(screen.getByText(/^\d+ results?$/)).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByRole('button', { name: /^Benefits/ })).not.toBeInTheDocument()
  })
})

describe('lazy editor route', () => {
  it('resolves the editor through lazy loading', async () => {
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(await screen.findByPlaceholderText('Give this page a title')).toBeInTheDocument()
  })
})
