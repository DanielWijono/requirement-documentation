import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { fakeDb } from '../fakeApi/db'

const newPageId = () => window.location.pathname.split('/')[4]
/** The page the app just created and opened in the editor. */
async function created() {
  await waitFor(() => expect(window.location.pathname).toMatch(/\/edit$/))
  return fakeDb.pages.get(newPageId())!
}

describe('create flow (design.md §8.4)', () => {
  it('templates prefill the page body and show a preview outline', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    await user.click(within(dialog).getByRole('button', { name: /Retrospective/ }))
    const preview = within(dialog).getByLabelText('Template preview')
    expect(within(preview).getByText('What went well')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect((await created()).draft?.html).toContain('<h2>What went well</h2>')
    expect(await screen.findByRole('heading', { name: 'What went well' })).toBeInTheDocument()
  })

  it('Cmd+Enter creates a blank page even when a template is selected', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    await user.click(within(dialog).getByRole('button', { name: /Meeting notes/ }))
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    const page = await created()
    expect(page).toMatchObject({ title: 'Untitled', status: 'draft' })
    expect(page.draft?.html).toBe('<p></p>')
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
    const page = await created()
    expect(page).toMatchObject({ parentId: 'pg.runbooks', status: 'draft', ownerId: 'u.daniel' })
    // Placed after the existing children.
    const siblings = [...fakeDb.pages.values()].filter((p) => p.parentId === 'pg.runbooks' && p.id !== page.id)
    expect(siblings.every((s) => s.position < page.position)).toBe(true)
  })

  it('space templates page lists the shared templates with their sections', () => {
    renderApp('/spaces/sp.eng/templates')
    expect(screen.getByText('Product requirements')).toBeInTheDocument()
    expect(screen.getByText(/Sections: Problem · Goals · Scope · Success metrics/)).toBeInTheDocument()
    expect(screen.queryByText('Blank page')).not.toBeInTheDocument()
  })
})
