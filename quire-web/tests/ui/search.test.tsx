import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'

const resultTitles = () =>
  within(screen.getByRole('list')).getAllByRole('listitem').map((li) => within(li).getAllByRole('button')[0].querySelector('span')!.textContent)

describe('search results (design.md §8.5)', () => {
  it('reads the query from the URL and ranks title matches first', () => {
    renderApp('/search?q=onboarding')
    expect(screen.getByLabelText('Search this site')).toHaveValue('onboarding')
    expect(resultTitles().slice(0, 2).sort()).toEqual(['New hire onboarding', 'Onboarding'])
  })

  it('snippets come from the published body and highlight the match', () => {
    renderApp('/search?q=retried')
    // The draft of ADR-012 says "retried up to 5 times"; readers only see the published "retried per consumer".
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent(/events are retried per consumer/)
    expect(within(item).getByText('retried', { selector: 'mark' })).toBeInTheDocument()
  })

  it('filters by label, type and last modified', async () => {
    const { user } = renderApp('/search')
    const labels = screen.getByRole('group', { name: 'Labels' })
    await user.click(within(labels).getByRole('button', { name: 'payments' }))
    expect(resultTitles()).toEqual(['ADR-012: Queueing strategy for payment events'])

    await user.click(within(labels).getByRole('button', { name: 'Any label' }))
    await user.click(within(screen.getByRole('group', { name: 'Last modified' })).getByRole('button', { name: 'Today' }))
    expect(resultTitles().length).toBeGreaterThan(0)
    expect(resultTitles()).not.toContain('Runbooks')

    await user.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: 'Blog post' }))
    expect(screen.getByText('No results.')).toBeInTheDocument()
  })

  it('zero results names the most restrictive filter and can remove it', async () => {
    const { user } = renderApp('/search?q=queue')
    await user.click(within(screen.getByRole('group', { name: 'Space' })).getByRole('button', { name: 'Product' }))
    await user.click(within(screen.getByRole('group', { name: 'Last modified' })).getByRole('button', { name: 'Past 30 days' }))
    expect(screen.getByText(/No results for/)).toBeInTheDocument()
    expect(screen.getByText('Product', { selector: 'strong' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    expect(resultTitles()).toContain('ADR-012: Queueing strategy for payment events')
  })

  it('sorts by last modified using real ages', async () => {
    const { user } = renderApp('/search')
    await user.click(screen.getByRole('button', { name: 'Last modified' }))
    const titles = resultTitles()
    expect(titles.indexOf('ADR-012: Queueing strategy for payment events')).toBeLessThan(titles.indexOf('Runbooks'))
  })

  it('command palette "See all results" carries the query', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByPlaceholderText(/search pages/i), 'roadmap')
    await user.click(screen.getByRole('button', { name: 'See all results' }))
    expect(window.location.search).toBe('?q=roadmap')
    expect(screen.getByLabelText('Search this site')).toHaveValue('roadmap')
  })

  it('spaces directory sorts by real recency', async () => {
    const { user } = renderApp('/spaces')
    await user.click(screen.getByRole('button', { name: /Sort: Name/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Recently active' }))
    const names = screen.getAllByText(/^(Engineering|Product|People ops)$/).map((n) => n.textContent)
    expect(names).toEqual(['Engineering', 'Product', 'People ops'])
  })
})
