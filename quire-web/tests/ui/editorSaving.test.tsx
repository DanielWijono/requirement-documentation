import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../renderApp'
import { fakeDb } from '../fakeApi/db'
import { server } from '../fakeApi/server'

/** Saving and conflicts in the editor (design.md §6.5, §9.2, §9.3). Autosave waits 700 ms, so these use real time. */

const fakePage = (id: string) => fakeDb.pages.get(id)!

async function openEditor(pageId = 'pg.onboarding') {
  const r = renderApp(`/spaces/sp.eng/pages/${pageId}/edit`)
  await screen.findByPlaceholderText('Give this page a title')
  const pm = document.querySelector('.ProseMirror') as HTMLElement
  pm.focus()
  return { ...r, type: (text: string) => r.user.type(pm, text) }
}

const saved = () => screen.findByText(/^Saved \d+s ago$/, {}, { timeout: 2000 })

describe('autosave', () => {
  it('shows Saving… then Saved, and the server has the latest body', async () => {
    const { type } = await openEditor()
    await type(' Autosaved.')
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    await saved()
    expect(fakePage('pg.onboarding').draft?.html).toContain('Autosaved.')
    await type(' Again.')
    await saved()
    expect(fakePage('pg.onboarding').draft).toMatchObject({ rev: 2 })
    expect(fakePage('pg.onboarding').draft?.html).toContain('Again.')
  })

  it('says it couldn’t save, and Retry sends the changes', async () => {
    server.use(http.put('*/api/pages/:id/draft', () => HttpResponse.json({ code: 'internal', message: 'Something went wrong' }, { status: 500 })))
    const { user, type } = await openEditor()
    await type(' Will retry.')
    expect(await screen.findByText(/Couldn’t save/, {}, { timeout: 2000 })).toBeInTheDocument()
    expect(fakePage('pg.onboarding').draft).toBeNull()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await saved()
    expect(fakePage('pg.onboarding').draft?.html).toContain('Will retry.')
  })

  it('goes offline without losing the body, and asks before leaving', async () => {
    server.use(http.put('*/api/pages/:id/draft', () => HttpResponse.error()))
    const { user, type } = await openEditor()
    await type(' Offline edit.')
    expect(await screen.findByText(/Offline — not saved yet/, {}, { timeout: 2000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close editor' }))
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(document.querySelector('.ProseMirror')?.textContent).toContain('Offline edit.')
  })

  it('leaves without asking once everything is saved', async () => {
    const { user, type } = await openEditor()
    await type(' Done.')
    await saved()
    await user.click(screen.getByRole('button', { name: 'Close editor' }))
    await waitFor(() => expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding'))
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })
})

describe('conflicts', () => {
  it('stops saving when someone else saved the draft, and offers Copy my changes and Reload', async () => {
    const { user, type } = await openEditor()
    // Someone else saves a draft of the same page after this editor loaded.
    fakePage('pg.onboarding').draft = { html: '<p>Their version.</p>', rev: 1, updatedAt: new Date().toISOString(), updatedById: 'u.priya' }
    await type(' Mine.')
    const banner = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(banner).toHaveTextContent('Someone else changed this page while you were editing.')
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
    expect(fakePage('pg.onboarding').draft?.html).toBe('<p>Their version.</p>')

    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await user.click(within(banner).getByRole('button', { name: 'Copy my changes' }))
    expect(writeText.mock.calls[0][0]).toContain('Mine.')

    await user.click(within(banner).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(document.querySelector('.ProseMirror')?.textContent).toBe('Their version.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refuses to publish over someone else’s publish', async () => {
    const { user, type } = await openEditor()
    await type(' Mine.')
    await saved()
    // Someone else publishes while this editor is open.
    fakePage('pg.onboarding').lockVersion += 1
    await user.click(screen.getByRole('button', { name: 'Update' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this page')
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding/edit')
    expect(fakePage('pg.onboarding').publishedHtml).not.toContain('Mine.')
  })
})
