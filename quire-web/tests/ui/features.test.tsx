import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../renderApp'
import { fakeDb } from '../fakeApi/db'
import { server } from '../fakeApi/server'
import { useUIStore } from '../../src/store/uiStore'

const fakePage = (id: string) => fakeDb.pages.get(id)!
const isStarred = (pageId: string) => fakeDb.pageStars.has(`u.daniel:${pageId}`)
const commentsOn = (pageId: string) => [...fakeDb.comments.values()].filter((c) => c.pageId === pageId)
const newPageId = () => window.location.pathname.split('/')[4]

describe('Spaces directory', () => {
  it('filters by all / starred / archived and shows empty state', async () => {
    const { user } = renderApp('/spaces')
    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.queryByText('Legacy platform')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'archived' }))
    expect(screen.getByText('Legacy platform')).toBeInTheDocument()
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'starred' }))
    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.queryByText('Product')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Unstar space' }))
    expect(await screen.findByText('No spaces match this filter.')).toBeInTheDocument()
  })

  it('creates a space and navigates to it', async () => {
    const { user } = renderApp('/spaces')
    await user.click(screen.getByRole('button', { name: 'Create space' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a space' })
    const submit = within(dialog).getByRole('button', { name: 'Create space' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByPlaceholderText('Design'), 'Design')
    await user.type(within(dialog).getByPlaceholderText('DES'), 'dsn')
    await user.click(submit)

    expect(await screen.findByText('This space has no pages yet')).toBeInTheDocument()
    const created = [...fakeDb.spaces.values()].find((s) => s.key === 'DSN')!
    expect(created).toMatchObject({ name: 'Design', ownerId: 'u.daniel' })
    expect(window.location.pathname).toBe(`/spaces/${created.id}`)
  })

  it('explains a space key that is already taken', async () => {
    const { user } = renderApp('/spaces')
    await user.click(screen.getByRole('button', { name: 'Create space' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a space' })
    await user.type(within(dialog).getByPlaceholderText('Design'), 'Engineering two')
    await user.type(within(dialog).getByPlaceholderText('DES'), 'eng')
    await user.click(within(dialog).getByRole('button', { name: 'Create space' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Another space already uses that key.')
    expect(window.location.pathname).toBe('/spaces')
  })
})

describe('Command palette', () => {
  it('shows recents and actions when empty, searches the server on query, and navigates with Enter', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).getByText('Toggle theme')).toBeInTheDocument()
    expect(await within(dialog).findByText('ADR-012: Queueing strategy for payment events')).toBeInTheDocument()

    await user.type(within(dialog).getByPlaceholderText(/search pages/i), 'roadmap')
    expect(within(dialog).getByText('See all results')).toBeInTheDocument()
    await within(dialog).findByText(/^Product ·/)
    await user.keyboard('{Enter}')
    expect(window.location.pathname).toBe('/spaces/sp.product/pages/pg.roadmap')
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('scopes to the current space and allows removing the scope', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('{Meta>}k{/Meta}')
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).getByText(/In ENG/)).toBeInTheDocument()

    await user.type(within(dialog).getByPlaceholderText(/search pages/i), 'q3')
    expect(await within(dialog).findByText('No results. Try removing a filter.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove scope' }))
    expect(await within(dialog).findByText('plan')).toBeInTheDocument() // "Q3 plan" with "Q3" highlighted
  })

  it('resets query and scope every time it reopens', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByPlaceholderText(/search pages/i), 'zzz')
    await user.click(screen.getByRole('button', { name: 'Remove scope' }))
    await user.keyboard('{Escape}')
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByPlaceholderText(/search pages/i)).toHaveValue('')
    expect(screen.getByText(/In ENG/)).toBeInTheDocument()
  })

  it('Toggle theme action switches theme', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(screen.getByText('Toggle theme'))
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})

describe('Create page', () => {
  it('creates a page from a template under a chosen parent and opens the editor', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    await user.click(screen.getByRole('button', { name: 'Add page' }))
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    const [, parentSelect] = within(dialog).getAllByRole('combobox')
    await user.selectOptions(parentSelect, 'pg.runbooks')
    await user.click(within(dialog).getByRole('button', { name: /Meeting notes/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(window.location.pathname).toMatch(/^\/spaces\/sp\.eng\/pages\/[^/]+\/edit$/))
    expect(fakePage(newPageId())).toMatchObject({ title: 'Meeting notes', parentId: 'pg.runbooks', status: 'draft' })
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    expect(await within(nav).findByRole('treeitem', { name: 'Meeting notes' })).toBeInTheDocument()
  })

  it('switching space resets the parent to space root', async () => {
    const { user } = renderApp('/')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    const [spaceSelect, parentSelect] = within(dialog).getAllByRole('combobox')
    await within(parentSelect).findByRole('option', { name: /Handbook/ })
    await user.selectOptions(parentSelect, 'pg.handbook')
    await user.selectOptions(spaceSelect, 'sp.product')
    expect(parentSelect).toHaveValue('')
    expect(await within(parentSelect).findByText(/Roadmap/)).toBeInTheDocument()
  })
})

describe('Page view', () => {
  it('records the view, shows breadcrumbs, owner line and unpublished banner', async () => {
    const before = fakeDb.recentViews.get('u.daniel:pg.adr-012')
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(screen.getByRole('button', { name: 'Handbook' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Architecture' })).toBeInTheDocument()
    expect(screen.getByText(/Unpublished changes by/)).toBeInTheDocument()
    await waitFor(() => expect(fakeDb.recentViews.get('u.daniel:pg.adr-012')).not.toBe(before))
  })

  it('stars the page and shows a toast', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getByTitle('Star (S)'))
    expect(screen.getByRole('status')).toHaveTextContent('Starred')
    await waitFor(() => expect(isStarred('pg.onboarding')).toBe(true))
  })

  it('"s" stars, "m" opens comments, "e" opens the editor', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.keyboard('s')
    await waitFor(() => expect(isStarred('pg.onboarding')).toBe(true))
    await user.keyboard('m')
    expect(useUIStore.getState()).toMatchObject({ rightPanelOpen: true, rightPanelTab: 'comments' })
    await user.keyboard('e')
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding/edit')
  })

  it('opens the share modal', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getAllByRole('button', { name: 'Share' })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Right panel', () => {
  it('lists unresolved comments, toggles resolved, and adds a comment', async () => {
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    expect(await within(panel).findByText('1 comment')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Show resolved (1)' }))
    expect(within(panel).getByText('2 comments')).toBeInTheDocument()
    expect(within(panel).getByText(/Linked this from the Q3 plan/)).toBeInTheDocument()

    const commentBtn = within(panel).getByRole('button', { name: 'Comment' })
    expect(commentBtn).toBeDisabled()
    await user.type(within(panel).getByPlaceholderText('Add a comment…'), 'Looks good')
    await user.click(commentBtn)
    expect(await within(panel).findByText('Looks good')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Comment added')
    expect(commentsOn('pg.adr-012').some((c) => c.body === 'Looks good' && c.authorId === 'u.daniel')).toBe(true)
  })

  it('resolves a comment', async () => {
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    await user.click(await within(panel).findByRole('button', { name: 'Resolve' }))
    expect(await within(panel).findByText('No comments yet.')).toBeInTheDocument()
  })

  it('attaches a pending anchor to a new comment', async () => {
    useUIStore.setState({ pendingCommentAnchor: 'selected words' })
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'Anchored')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(useUIStore.getState().pendingCommentAnchor).toBeNull())
    expect(commentsOn('pg.onboarding').find((c) => c.body === 'Anchored')?.anchorText).toBe('selected words')
  })

  it('keeps a comment that failed to post so it can be sent again', async () => {
    useUIStore.getState().openRightPanel('comments')
    server.use(http.post('*/api/pages/:id/comments', () => HttpResponse.json({ code: 'internal', message: 'Something went wrong' }, { status: 500 })))
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'Will fail')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText(/Couldn’t post your comment/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a comment…')).toHaveValue('Will fail')
  })

  it('History tab lists versions; Details tab renders', async () => {
    useUIStore.getState().openRightPanel('history')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    expect(await within(panel).findByText('Current')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Details' }))
    expect(useUIStore.getState().rightPanelTab).toBe('details')
  })

  it('History tab shows empty state for never-published drafts', async () => {
    useUIStore.getState().openRightPanel('history')
    renderApp('/spaces/sp.eng/pages/pg.new-draft')
    expect(await screen.findByText('No published versions yet.')).toBeInTheDocument()
  })
})

describe('Editor', () => {
  async function typeInBody(user: ReturnType<typeof renderApp>['user'], text: string) {
    const pm = document.querySelector('.ProseMirror') as HTMLElement
    pm.focus()
    await user.type(pm, text)
  }

  it('loads the editor with title and publishes a draft', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.new-draft/edit')
    const title = await screen.findByPlaceholderText('Give this page a title')
    expect(title).toHaveValue('')
    await user.type(title, 'My new doc')
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.new-draft'))
    expect(fakePage('pg.new-draft')).toMatchObject({ title: 'My new doc', status: 'published', publishedVersion: 1, draft: null })
    expect(fakePage('pg.new-draft').versions[0].version).toBe(1)
  })

  it('shows "Update" for published pages and publishes changes with a version comment', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    await screen.findByPlaceholderText('Give this page a title')
    const before = fakePage('pg.onboarding').publishedVersion
    await typeInBody(user, ' More.')
    await user.click(screen.getByRole('button', { name: 'Publish options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Publish options…' }))
    const dialog = screen.getByRole('dialog', { name: 'Publish options' })
    await user.type(within(dialog).getByPlaceholderText('What changed?'), 'Fix typo')
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding'))
    expect(fakePage('pg.onboarding').versions[0]).toMatchObject({ version: before + 1, comment: 'Fix typo' })
    expect(fakePage('pg.onboarding').publishedHtml).toContain('More.')
  })

  it('"Update" without changes publishes nothing and goes back to reading', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    await screen.findByPlaceholderText('Give this page a title')
    const before = fakePage('pg.onboarding').publishedVersion
    await user.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding'))
    expect(fakePage('pg.onboarding').publishedVersion).toBe(before)
  })

  it('save as draft keeps the page a draft', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.new-draft/edit')
    await screen.findByPlaceholderText('Give this page a title')
    await user.click(screen.getByRole('button', { name: 'Publish options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save as draft' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as draft')
    expect(fakePage('pg.new-draft').status).toBe('draft')
  })

  it('close button returns to view and persists an empty title as "Untitled"', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    const title = await screen.findByPlaceholderText('Give this page a title')
    await user.clear(title)
    await user.click(screen.getByRole('button', { name: 'Close editor' }))
    await waitFor(() => expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding'))
    expect(fakePage('pg.onboarding').title).toBe('Untitled')
  })
})

describe('Page state: published vs unpublished changes', () => {
  it('read mode shows the published body; View shows the draft', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(screen.getByText(/six downstream consumers/)).toBeInTheDocument()
    expect(screen.queryByText(/nine downstream consumers/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByText(/nine downstream consumers/)).toBeInTheDocument()
    expect(screen.getByText(/Viewing unpublished changes/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show published' }))
    expect(screen.getByText(/six downstream consumers/)).toBeInTheDocument()
  })

  it('"Discard" reverts to the published body without publishing a new version', async () => {
    const versions = fakePage('pg.adr-012').versions.length
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByText(/Unpublished changes/)).not.toBeInTheDocument())
    expect(fakePage('pg.adr-012').draft).toBeNull()
    expect(fakePage('pg.adr-012').versions).toHaveLength(versions)
  })
})

describe('Page actions', () => {
  async function openMore(user: ReturnType<typeof renderApp>['user']) {
    await user.click(screen.getByRole('button', { name: 'More actions' }))
  }

  it('Copy link writes the page URL and shows a toast', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    // user-event installs its own clipboard stub during setup, so spy on it afterwards.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/spaces/sp.eng/pages/pg.onboarding`)
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  })

  it('Move… reparents the page', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Move…' }))
    const dialog = screen.getByRole('dialog', { name: /Move/ })
    const select = within(dialog).getByLabelText('New parent')
    expect(within(select).queryByText(/^Onboarding$/)).not.toBeInTheDocument()
    await user.selectOptions(select, 'pg.runbooks')
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('button', { name: 'Runbooks' })).toBeInTheDocument() // breadcrumb
    expect(fakePage('pg.onboarding').parentId).toBe('pg.runbooks')
  })

  it('Copy… creates a draft copy and opens it in the editor', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Copy…' }))
    await waitFor(() => expect(window.location.pathname).toMatch(/\/pages\/[^/]+\/edit$/))
    expect(await screen.findByDisplayValue('Copy of Onboarding')).toBeInTheDocument()
    expect(fakePage(newPageId())).toMatchObject({ status: 'draft', ownerId: 'u.daniel' })
  })

  it('Archive shows the archived banner, Undo restores it', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(await screen.findByText('Archived')).toBeInTheDocument()
    expect(fakePage('pg.onboarding').status).toBe('archived')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(fakePage('pg.onboarding').status).toBe('published'))
  })

  it('archived banner Restore puts the page back in the tree', async () => {
    Object.assign(fakePage('pg.onboarding'), { status: 'archived', statusBeforeTrash: 'published' })
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(fakePage('pg.onboarding').status).toBe('published'))
    expect(await within(screen.getByRole('navigation', { name: 'Engineering' })).findByText('Onboarding')).toBeInTheDocument()
  })

  it('Delete asks for confirmation (focus on Cancel) and shows the deleted screen', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this page?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('heading', { name: 'This page was deleted' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore page' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Onboarding' })).toBeInTheDocument()
  })

  it('shows why an action failed', async () => {
    server.use(http.post('*/api/pages/:id/archive', () => HttpResponse.json({ code: 'forbidden', message: 'You cannot archive or delete this page' }, { status: 403 })))
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(await screen.findByText('Couldn’t archive the page: You cannot archive or delete this page')).toBeInTheDocument()
    expect(fakePage('pg.onboarding').status).toBe('published')
  })

  it('deleted pages disappear from Home and the command palette', async () => {
    Object.assign(fakePage('pg.q3-plan'), { status: 'deleted', statusBeforeTrash: 'published' })
    const { user } = renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Recently viewed' })).toBeInTheDocument()
    expect(screen.queryByText('Q3 plan')).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByPlaceholderText(/search pages/i), 'q3')
    expect(await screen.findByText('No results. Try removing a filter.')).toBeInTheDocument()
    expect(screen.queryByText('plan')).not.toBeInTheDocument()
  })

  it('tree row menu offers the same actions plus New child page', async () => {
    const { user } = renderApp('/spaces/sp.eng')
    const nav = screen.getByRole('navigation', { name: 'Engineering' })
    const row = within(nav).getByText('Runbooks').closest('[role="treeitem"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Page actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New child page' }))
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    expect(within(dialog).getAllByRole('combobox')[1]).toHaveValue('pg.runbooks')
  })
})

describe('Comments: replies', () => {
  it('saves a reply with the Reply button and with Cmd+Enter', async () => {
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    await user.click(await within(panel).findByRole('button', { name: 'Reply' }))
    await user.type(within(panel).getByPlaceholderText('Reply…'), 'First reply')
    await user.click(within(panel).getAllByRole('button', { name: 'Reply' }).at(-1)!)
    expect(await within(panel).findByText('First reply')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Reply' }))
    await user.type(within(panel).getByPlaceholderText('Reply…'), 'Second{Meta>}{Enter}{/Meta}')
    await waitFor(() =>
      expect(
        commentsOn('pg.adr-012')
          .filter((c) => c.parentId === 'c1')
          .map((c) => c.body),
      ).toEqual(expect.arrayContaining(['First reply', 'Second'])),
    )
  })
})

describe('Version history', () => {
  it('restores a version with a snapshot and offers no restore without one', async () => {
    useUIStore.getState().openRightPanel('history')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    await user.click(await within(panel).findByText('Version 4'))
    expect(await screen.findByText(/isn’t available to restore/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await user.click(within(panel).getByText('Version 5'))
    await user.click(await screen.findByRole('button', { name: 'Restore this version' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Restore this version?' })).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(fakePage('pg.adr-012').versions[0].comment).toBe('Restored version 5'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Consequences' })).not.toBeInTheDocument())
  })
})

describe('Create page entry points', () => {
  it('Home empty state and the palette action open the Create dialog', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(screen.getByText('Create page'))
    expect(screen.getByRole('dialog', { name: 'Create' })).toBeInTheDocument()
  })
})
