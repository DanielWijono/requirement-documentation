import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { useContentStore } from '../../src/store/contentStore'

const content = () => useContentStore.getState()

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
    const row = within(nav).getByText('ADR-012 Queueing').closest('[role="treeitem"]') as HTMLElement
    expect(within(row).getByRole('img', { name: 'Unpublished changes' })).toBeInTheDocument()
  })

  it('archive view lists archived pages and restores them', async () => {
    content().archivePage('pg.deploys')
    const { user } = renderApp('/spaces/sp.eng')
    await user.click(screen.getByRole('button', { name: 'Archived pages' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/archive')
    const list = screen.getByRole('list')
    expect(within(list).getByText('Untitled')).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Restore' }))
    expect(content().pages['pg.deploys'].state).toBe('draft')
    expect(screen.getByText('Nothing is archived in this space.')).toBeInTheDocument()
  })

  it('archived seed pages are not in the tree but are in the archive view', () => {
    renderApp('/spaces/sp.legacy/archive')
    expect(screen.getByText('Old API reference')).toBeInTheDocument()
    expect(screen.getByText('This space has no pages yet')).toBeInTheDocument()
  })

  it('archived pages dim images only', () => {
    content().saveContent('pg.onboarding', '<p>Text</p><img src="x.png" alt="diagram">', { publish: true })
    content().archivePage('pg.onboarding')
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    const body = screen.getByAltText('diagram').closest('.prose') as HTMLElement
    expect(body.className).toContain('[&_img]:opacity-70')
  })
})

describe('403 vs 404', () => {
  it('restricted pages the user cannot view show a 403 that never reveals the title', async () => {
    const { user } = renderApp('/spaces/sp.people/pages/pg.benefits')
    expect(screen.getByRole('heading', { name: /don’t have permission/ })).toBeInTheDocument()
    expect(screen.getByText(/Ask the owner, Wren, for access/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Benefits' })).not.toBeInTheDocument()
    expect(screen.queryByText(/plan details/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Request access' }))
    expect(screen.getByRole('button', { name: 'Access requested' })).toBeDisabled()
  })

  it('the editor route is also forbidden, and the view is not recorded', async () => {
    renderApp('/spaces/sp.people/pages/pg.benefits/edit')
    expect(await screen.findByRole('heading', { name: /don’t have permission/ })).toBeInTheDocument()
    expect(content().recentlyViewed.some((r) => r.pageId === 'pg.benefits')).toBe(false)
  })

  it('restricted pages the user can view render normally with the Restricted lozenge', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(screen.getByText('Restricted')).toBeInTheDocument()
  })

  it('unknown pages still show the 404', () => {
    renderApp('/spaces/sp.people/pages/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('forbidden pages are hidden from search', async () => {
    const { user } = renderApp('/search')
    await user.type(screen.getByPlaceholderText('Search this site'), 'Benefits')
    expect(screen.queryByRole('button', { name: /^Benefits/ })).not.toBeInTheDocument()
  })
})

describe('lazy editor route', () => {
  it('resolves the editor through lazy loading', async () => {
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(await screen.findByPlaceholderText('Give this page a title')).toBeInTheDocument()
  })
})
