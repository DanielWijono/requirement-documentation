import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { useContentStore } from '../../src/store/contentStore'
import { useUIStore } from '../../src/store/uiStore'

describe('routing & shell', () => {
  it('renders Home with recently viewed, drafts, following feed and spaces', () => {
    renderApp('/')
    for (const h of ['Recently viewed', 'Drafts', 'Following feed', 'Your spaces']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    }
    // archived space is hidden from "Your spaces"
    const aside = screen.getByRole('heading', { name: 'Your spaces' }).parentElement!
    expect(within(aside).queryByText('Legacy platform')).not.toBeInTheDocument()
  })

  it('shows the new-user empty state when there is no history and no drafts', () => {
    const pages = Object.fromEntries(
      Object.entries(useContentStore.getState().pages).filter(([, p]) => p.state !== 'draft'),
    )
    useContentStore.setState({ recentlyViewed: [], pages })
    renderApp('/')
    expect(screen.getByRole('heading', { name: /start by joining a space/i })).toBeInTheDocument()
  })

  it('navigates from Home recently viewed to the page', async () => {
    const { user } = renderApp('/')
    const recent = screen.getByRole('heading', { name: 'Recently viewed' }).parentElement!
    await user.click(within(recent).getByRole('button', { name: /ADR-012: Queueing strategy/ }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.adr-012')
    expect(screen.getByRole('heading', { level: 1, name: /ADR-012/ })).toBeInTheDocument()
  })

  it('renders NotFound for unknown routes and unknown page ids', async () => {
    const { user, unmount } = renderApp('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go home' }))
    expect(window.location.pathname).toBe('/')
    unmount()

    renderApp('/spaces/sp.eng/pages/missing')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it.each([
    ['/spaces/sp.eng', 'Engineering'],
    ['/spaces/sp.eng/settings', 'Space settings'],
    ['/spaces/sp.eng/templates', /templates/i],
    ['/spaces/sp.people/blog', /No posts yet in People ops/],
  ])('renders space route %s', (path, heading) => {
    renderApp(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('space nav shows the page tree and expands ancestors of the active page', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    const active = within(nav).getByRole('treeitem', { selected: true })
    expect(active).toHaveTextContent('ADR-012 Queueing')
    expect(within(nav).getByText('Service map')).toBeInTheDocument()
  })

  it('collapses and expands the space nav', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    await user.click(within(nav).getAllByRole('button', { name: /^collapse$/i }).at(-1)!) // footer; tree chevrons share the label
    expect(screen.queryByRole('navigation', { name: 'Engineering' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(screen.getByRole('navigation', { name: 'Engineering' })).toBeInTheDocument()
  })

  it('applies theme / density / font attributes to <html> from the account menu', async () => {
    const { user } = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Theme: system' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Density/ }))
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    expect(useUIStore.getState().density).toBe('compact')
  })
})

describe('global keyboard shortcuts', () => {
  it('Cmd+K and "/" open the command palette; Escape closes it', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    await user.keyboard('/')
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('"c" opens the Create dialog and "?" opens shortcuts', async () => {
    const { user } = renderApp('/')
    await user.keyboard('c')
    expect(screen.getByRole('dialog', { name: 'Create' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.keyboard('?')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('"[" toggles nav and "]" toggles right panel', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const before = useUIStore.getState().navCollapsed
    await user.keyboard('[[')
    expect(useUIStore.getState().navCollapsed).toBe(!before)
    await user.keyboard(']')
    expect(screen.getByRole('complementary', { name: 'Page panel' })).toBeInTheDocument()
  })

  it('shortcuts are ignored while typing in an input', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByPlaceholderText(/search pages/i), 'c[[')
    expect(screen.queryByRole('dialog', { name: 'Create' })).not.toBeInTheDocument()
  })
})
