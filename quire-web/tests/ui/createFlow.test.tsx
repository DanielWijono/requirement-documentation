import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { findTreeNodeIn, useContentStore } from '../../src/store/contentStore'

const content = () => useContentStore.getState()
const newPageId = () => window.location.pathname.split('/')[4]

describe('create flow (design.md §8.4)', () => {
  it('templates prefill the page body and show a preview outline', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    await user.click(within(dialog).getByRole('button', { name: /Retrospective/ }))
    const preview = within(dialog).getByLabelText('Template preview')
    expect(within(preview).getByText('What went well')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(content().pages[newPageId()].contentHtml).toContain('<h2>What went well</h2>')
    expect(await screen.findByRole('heading', { name: 'What went well' })).toBeInTheDocument()
  })

  it('Cmd+Enter creates a blank page even when a template is selected', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    await user.click(within(dialog).getByRole('button', { name: /Meeting notes/ }))
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(content().pages[newPageId()]).toMatchObject({ title: 'Untitled', contentHtml: '<p></p>' })
  })

  it('defaults the parent to the current page’s parent context', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.keyboard('c')
    const [, parent] = within(screen.getByRole('dialog', { name: 'Create' })).getAllByRole('combobox')
    expect(parent).toHaveValue('pg.handbook')
  })

  it('tree row + creates a blank child draft without the modal', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    const row = within(nav).getByText('Runbooks').closest('[role="treeitem"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Add child page' }))
    expect(screen.queryByRole('dialog', { name: 'Create' })).not.toBeInTheDocument()
    expect(window.location.pathname).toMatch(/\/edit$/)
    expect(content().pages[newPageId()]).toMatchObject({ parentId: 'pg.runbooks', state: 'draft' })
    expect(findTreeNodeIn(content().pageTree['sp.eng'], 'pg.runbooks')?.children.at(-1)?.id).toBe(newPageId())
  })

  it('space templates page lists the shared templates with their sections', () => {
    renderApp('/spaces/sp.eng/templates')
    expect(screen.getByText('Product requirements')).toBeInTheDocument()
    expect(screen.getByText(/Sections: Problem · Goals · Scope · Success metrics/)).toBeInTheDocument()
    expect(screen.queryByText('Blank page')).not.toBeInTheDocument()
  })
})
