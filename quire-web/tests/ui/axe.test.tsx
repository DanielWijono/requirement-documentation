import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderApp } from '../renderApp'
import { useUIStore } from '../../src/store/uiStore'

/** Run axe on the whole document; colour contrast needs real layout, which jsdom lacks. */
async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

describe('axe: main screens have no detectable accessibility violations', () => {
  it.each([
    ['home', '/'],
    ['spaces directory', '/spaces'],
    ['space overview', '/spaces/sp.eng'],
    ['page view', '/spaces/sp.eng/pages/pg.adr-012'],
    ['search', '/search?q=queue'],
    ['space settings', '/spaces/sp.eng/settings'],
    ['archive view', '/spaces/sp.legacy/archive'],
    ['403', '/spaces/sp.people/pages/pg.benefits'],
    ['404', '/nowhere'],
  ])('%s', async (_name, path) => {
    renderApp(path)
    expect(await violations()).toEqual([])
  })

  it('page with the right panel open', async () => {
    useUIStore.getState().openRightPanel('comments')
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(await violations()).toEqual([])
  })

  it('editor', async () => {
    renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    await screen.findByPlaceholderText('Give this page a title')
    expect(await violations()).toEqual([])
  })

  it('create dialog', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('c')
    expect(await violations()).toEqual([])
  })

  it('share dialog', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getAllByRole('button', { name: 'Share' })[0])
    expect(await violations()).toEqual([])
  })

  it('command palette', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await violations()).toEqual([])
  })
})
