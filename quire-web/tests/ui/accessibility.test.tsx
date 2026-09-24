import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { PageSkeleton } from '../../src/components/ui/Skeleton'

describe('skip links and landmarks (design.md §11)', () => {
  it('offers skip links that target main content and the page tree', () => {
    renderApp('/spaces/sp.eng/pages/pg.onboarding')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('link', { name: 'Skip to page tree' })).toHaveAttribute('href', '#page-tree')
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN')
    expect(document.getElementById('page-tree')).toHaveAttribute('role', 'tree')
  })

  it('omits the page tree skip link outside a space', () => {
    renderApp('/')
    expect(screen.queryByRole('link', { name: 'Skip to page tree' })).not.toBeInTheDocument()
  })
})

describe('page tree keyboard (WAI-ARIA tree pattern)', () => {
  it('exposes level, position and set size, with a single tab stop on the current page', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const tree = screen.getByRole('tree', { name: 'Engineering pages' })
    const current = within(tree).getByRole('treeitem', { name: 'ADR-012: Queueing strategy for payment events' })
    expect(current).toHaveAttribute('aria-level', '3')
    expect(current).toHaveAttribute('aria-posinset', '1')
    expect(current).toHaveAttribute('aria-setsize', '2')
    expect(within(tree).getAllByRole('treeitem').filter((r) => r.tabIndex === 0)).toEqual([current])
  })

  it('arrow keys move, expand, collapse and go to the parent; Enter opens', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    const tree = screen.getByRole('tree')
    const handbook = within(tree).getByRole('treeitem', { name: 'Handbook' })
    handbook.focus()

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(within(tree).getByRole('treeitem', { name: 'Onboarding' }))
    await user.keyboard('{ArrowDown}')
    const architecture = within(tree).getByRole('treeitem', { name: 'Architecture' })
    expect(document.activeElement).toBe(architecture)
    expect(architecture).toHaveAttribute('aria-expanded', 'false')

    await user.keyboard('{ArrowRight}')
    expect(architecture).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(within(tree).getByRole('treeitem', { name: 'ADR-012: Queueing strategy for payment events' }))

    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(architecture)
    await user.keyboard('{ArrowLeft}')
    expect(architecture).toHaveAttribute('aria-expanded', 'false')

    await user.keyboard('{End}')
    expect(document.activeElement).toHaveAccessibleName('Untitled')
    await user.keyboard('{Home}{Enter}')
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.handbook')
  })
})

describe('focus is never lost (design.md §11)', () => {
  it('returns focus to the opener when the command palette closes', async () => {
    const { user } = renderApp('/')
    const search = screen.getAllByRole('button', { name: /^Search/ })[0]
    await user.click(search)
    expect(screen.getByPlaceholderText(/search pages/i)).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(search).toHaveFocus()
  })

  it('returns focus to the menu trigger after Escape', async () => {
    const { user } = renderApp('/')
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the control that opened a modal', async () => {
    const { user } = renderApp('/spaces')
    const create = screen.getByRole('button', { name: 'Create space' })
    await user.click(create)
    await user.keyboard('{Escape}')
    expect(create).toHaveFocus()
  })

  it('right panel is full width on phones instead of a fixed width', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.keyboard(']')
    expect(screen.getByRole('complementary', { name: 'Page panel' }).className).toMatch(/w-full sm:w-\[360px\]/)
  })
})

describe('loading skeleton (design.md §10)', () => {
  it('mirrors the page layout and only animates when motion is allowed', () => {
    render(<PageSkeleton />)
    const status = screen.getByRole('status', { name: 'Loading page' })
    const bars = status.querySelectorAll('span')
    expect(bars).toHaveLength(7)
    expect((bars[0] as HTMLElement).style.width).toBe('60%')
    bars.forEach((b) => expect(b.className).toContain('motion-safe:animate-pulse'))
  })
})
