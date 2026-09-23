import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { useContentStore } from '../../src/store/contentStore'
import { useUIStore } from '../../src/store/uiStore'

describe('editor keyboard (design.md §9.1, §11)', () => {
  async function openEditor() {
    const r = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    await screen.findByPlaceholderText('Give this page a title')
    const pm = document.querySelector('.ProseMirror') as HTMLElement
    pm.focus()
    return { ...r, pm }
  }

  it('⌘K in the editor opens the link prompt instead of the command palette', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const { user } = await openEditor()
    // Tiptap's "Mod" is Ctrl off macOS, and jsdom does not report a Mac platform.
    await user.keyboard('{Control>}k{/Control}')
    expect(prompt).toHaveBeenCalledWith('Link URL', 'https://')
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    prompt.mockRestore()
  })

  it('Escape moves focus from the editor to the toolbar; the toolbar is one tab stop with arrow keys', async () => {
    const { user } = await openEditor()
    await user.keyboard('{Escape}')
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    expect(toolbar.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toHaveAttribute('tabindex', '0')
    expect([...toolbar.querySelectorAll<HTMLElement>('button, select')].filter((b) => b.tabIndex === 0)).toHaveLength(1)

    const first = document.activeElement
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).not.toBe(first)
    expect(document.activeElement).toHaveAttribute('tabindex', '0')
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(first)
  })
})

describe('reading: comment anchors (design.md §6.9)', () => {
  it('highlights anchored text and opens its thread on click', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    // The anchored sentence only exists in the unpublished draft.
    await user.click(screen.getByRole('button', { name: 'View' }))
    const anchor = screen.getByRole('button', { name: 'Comment on “events are retried up to 5 times”' })
    await user.click(anchor)
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    const thread = within(panel).getByText(/cover the retry policy/).closest('[id^="comment-"]')
    expect(thread).toHaveAttribute('aria-current', 'true')
  })

  it('resolved comments are not highlighted', async () => {
    useContentStore.getState().toggleResolveComment('pg.adr-012', 'c1')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(document.querySelector('mark[data-comment-id]')).toBeNull()
  })

  it('"M" uses the current body selection as the comment anchor', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    const paragraph = document.querySelector('.prose p') as HTMLElement
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    await user.keyboard('m')
    expect(useUIStore.getState().pendingCommentAnchor).toBe(paragraph.textContent!.trim())
    window.getSelection()!.removeAllRanges()
  })
})

describe('reading: internal links (design.md §9.4)', () => {
  it('shows a preview card after hovering and navigates in-app on click', async () => {
    useContentStore.getState().saveContent('pg.runbooks', '<p>See <a href="/spaces/sp.eng/pages/pg.onboarding">onboarding</a>.</p>', { publish: true })
    const { user } = renderApp('/spaces/sp.eng/pages/pg.runbooks')
    const link = screen.getByRole('link', { name: 'onboarding' })
    await user.hover(link)
    const card = await screen.findByRole('tooltip')
    expect(card).toHaveTextContent('Onboarding')
    expect(card).toHaveTextContent(/Engineering · Updated/)
    await user.click(link)
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding')
  })

  it('preview never reveals the title of a page the reader cannot view', async () => {
    useContentStore.getState().saveContent('pg.runbooks', '<p><a href="/spaces/sp.people/pages/pg.benefits">secret</a></p>', { publish: true })
    const { user } = renderApp('/spaces/sp.eng/pages/pg.runbooks')
    await user.hover(screen.getByRole('link', { name: 'secret' }))
    const card = await screen.findByRole('tooltip')
    expect(card).toHaveTextContent('You don’t have access to this page.')
    expect(card).not.toHaveTextContent('Benefits')
    await user.unhover(screen.getByRole('link', { name: 'secret' }))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
