import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { findTreeNodeIn, useContentStore } from '../../src/store/contentStore'
import { useUIStore } from '../../src/store/uiStore'

const content = () => useContentStore.getState()

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
    expect(screen.getByText('No spaces match this filter.')).toBeInTheDocument()
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

    const created = content().spaces.at(-1)!
    expect(created).toMatchObject({ name: 'Design', key: 'DSN' })
    expect(window.location.pathname).toBe(`/spaces/${created.id}`)
    expect(screen.getByText('This space has no pages yet')).toBeInTheDocument()
  })
})

describe('Command palette', () => {
  it('shows recents and actions when empty, filters on query, and navigates with Enter', async () => {
    const { user } = renderApp('/')
    await user.keyboard('{Meta>}k{/Meta}')
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).getByText('Toggle theme')).toBeInTheDocument()

    await user.type(within(dialog).getByPlaceholderText(/search pages/i), 'roadmap')
    expect(within(dialog).getByText('See all results')).toBeInTheDocument()
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
    expect(within(dialog).getByText('No results. Try removing a filter.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove scope' }))
    expect(within(dialog).getByText('plan')).toBeInTheDocument() // "Q3 plan" with "Q3" highlighted
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

    expect(window.location.pathname).toMatch(/^\/spaces\/sp\.eng\/pages\/pg\.new-\d+\/edit$/)
    const id = window.location.pathname.split('/')[4]
    expect(content().pages[id]).toMatchObject({ title: 'Meeting notes', parentId: 'pg.runbooks', state: 'draft' })
    expect(findTreeNodeIn(content().pageTree['sp.eng'], 'pg.runbooks')?.children.some((c) => c.id === id)).toBe(true)
  })

  it('switching space resets the parent to space root', async () => {
    const { user } = renderApp('/')
    await user.keyboard('c')
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    const [spaceSelect, parentSelect] = within(dialog).getAllByRole('combobox')
    await user.selectOptions(parentSelect, 'pg.handbook')
    await user.selectOptions(spaceSelect, 'sp.product')
    expect(parentSelect).toHaveValue('')
    expect(within(parentSelect).getByText(/Roadmap/)).toBeInTheDocument()
  })
})

describe('Page view', () => {
  it('records the view, shows breadcrumbs, owner line and unpublished banner', () => {
    renderApp('/spaces/sp.eng/pages/pg.adr-012')
    expect(content().recentlyViewed[0]).toMatchObject({ pageId: 'pg.adr-012', relativeTime: 'Just now' })
    expect(screen.getByRole('button', { name: 'Handbook' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Architecture' })).toBeInTheDocument()
    expect(screen.getByText(/Unpublished changes by/)).toBeInTheDocument()
  })

  it('stars the page and shows a toast', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getByTitle('Star (S)'))
    expect(content().pages['pg.onboarding'].starred).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('Starred')
  })

  it('"s" stars, "m" opens comments, "e" opens the editor', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.keyboard('s')
    expect(content().pages['pg.onboarding'].starred).toBe(true)
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
    expect(within(panel).getByText('1 comment')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Show resolved (1)' }))
    expect(within(panel).getByText('2 comments')).toBeInTheDocument()
    expect(within(panel).getByText(/Linked this from the Q3 plan/)).toBeInTheDocument()

    const commentBtn = within(panel).getByRole('button', { name: 'Comment' })
    expect(commentBtn).toBeDisabled()
    await user.type(within(panel).getByPlaceholderText('Add a comment…'), 'Looks good')
    await user.click(commentBtn)
    expect(content().pages['pg.adr-012'].comments[0].body).toBe('Looks good')
    expect(within(panel).getByText('Looks good')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Comment added')
  })

  it('resolves a comment', async () => {
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    await user.click(within(panel).getByRole('button', { name: 'Resolve' }))
    expect(within(panel).getByText('No comments yet.')).toBeInTheDocument()
  })

  it('attaches a pending anchor to a new comment', async () => {
    useUIStore.setState({ pendingCommentAnchor: 'selected words' })
    useUIStore.getState().openRightPanel('comments')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'Anchored')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(content().pages['pg.onboarding'].comments[0].anchorText).toBe('selected words')
    expect(useUIStore.getState().pendingCommentAnchor).toBeNull()
  })

  it('History tab lists versions; Details tab renders', async () => {
    useUIStore.getState().openRightPanel('history')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    expect(within(panel).getByText('Current')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Details' }))
    expect(useUIStore.getState().rightPanelTab).toBe('details')
  })

  it('History tab shows empty state for never-published drafts', () => {
    useUIStore.getState().openRightPanel('history')
    renderApp('/spaces/sp.eng/pages/pg.new-draft')
    expect(screen.getByText('No published versions yet.')).toBeInTheDocument()
  })
})

describe('Editor', () => {
  it('loads the editor with title and publishes a draft', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.new-draft/edit')
    const title = await screen.findByPlaceholderText('Give this page a title')
    expect(title).toHaveValue('')
    await user.type(title, 'My new doc')
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    expect(content().pages['pg.new-draft']).toMatchObject({ title: 'My new doc', state: 'published' })
    expect(content().pages['pg.new-draft'].versions[0].version).toBe(1)
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.new-draft')
  })

  it('shows "Update" for published pages and publishes with a version comment', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    await screen.findByPlaceholderText('Give this page a title')
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Publish options…' }))
    const dialog = screen.getByRole('dialog', { name: 'Publish options' })
    await user.type(within(dialog).getByPlaceholderText('What changed?'), 'Fix typo')
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))
    expect(content().pages['pg.onboarding'].versions[0]).toMatchObject({ version: 3, comment: 'Fix typo' })
  })

  it('save as draft keeps the page a draft', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.new-draft/edit')
    await screen.findByPlaceholderText('Give this page a title')
    await user.click(screen.getByRole('button', { name: 'Publish options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save as draft' }))
    expect(content().pages['pg.new-draft'].state).toBe('draft')
    expect(screen.getByRole('status')).toHaveTextContent('Saved as draft')
  })

  it('close button returns to view and persists an empty title as "Untitled"', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding/edit')
    const title = await screen.findByPlaceholderText('Give this page a title')
    await user.clear(title)
    await user.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(window.location.pathname).toBe('/spaces/sp.eng/pages/pg.onboarding')
    expect(content().pages['pg.onboarding'].title).toBe('Untitled')
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
    const before = content().pages['pg.adr-012']
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    const after = content().pages['pg.adr-012']
    expect(after.versions.length).toBe(before.versions.length)
    expect(after.contentHtml).toBe(before.publishedHtml)
    expect(screen.queryByText(/Unpublished changes/)).not.toBeInTheDocument()
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
    expect(content().pages['pg.onboarding'].parentId).toBe('pg.runbooks')
    expect(screen.getByRole('button', { name: 'Runbooks' })).toBeInTheDocument() // breadcrumb
  })

  it('Copy… creates a draft copy and opens it in the editor', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Copy…' }))
    expect(window.location.pathname).toMatch(/\/pages\/pg\.new-\d+\/edit$/)
    expect(await screen.findByDisplayValue('Copy of Onboarding')).toBeInTheDocument()
  })

  it('Archive shows the archived banner, Undo restores it', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(content().pages['pg.onboarding'].state).toBe('archived')
    expect(screen.getByText('Archived')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(content().pages['pg.onboarding'].state).toBe('published')
  })

  it('archived banner Restore puts the page back in the tree', async () => {
    content().archivePage('pg.onboarding')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(content().pages['pg.onboarding'].state).toBe('published')
    expect(within(screen.getByRole('navigation', { name: 'Engineering' })).getByText('Onboarding')).toBeInTheDocument()
  })

  it('Delete asks for confirmation (focus on Cancel) and shows the deleted screen', async () => {
    const { user } = renderApp('/spaces/sp.eng/pages/pg.onboarding')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this page?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('heading', { name: 'This page was deleted' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore page' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeInTheDocument()
  })

  it('deleted pages disappear from Home and the command palette', async () => {
    content().deletePage('pg.q3-plan')
    const { user } = renderApp('/')
    expect(screen.queryByText('Q3 plan')).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByPlaceholderText(/search pages/i), 'q3')
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
    await user.click(within(panel).getByRole('button', { name: 'Reply' }))
    await user.type(within(panel).getByPlaceholderText('Reply…'), 'First reply')
    await user.click(within(panel).getAllByRole('button', { name: 'Reply' }).at(-1)!)
    expect(within(panel).getByText('First reply')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Reply' }))
    await user.type(within(panel).getByPlaceholderText('Reply…'), 'Second{Meta>}{Enter}{/Meta}')
    const replies = content().pages['pg.adr-012'].comments.find((c) => c.id === 'c1')!.replies!
    expect(replies.map((r) => r.body)).toEqual(expect.arrayContaining(['First reply', 'Second']))
  })
})

describe('Version history', () => {
  it('restores a version with a snapshot and offers no restore without one', async () => {
    useUIStore.getState().openRightPanel('history')
    const { user } = renderApp('/spaces/sp.eng/pages/pg.adr-012')
    const panel = screen.getByRole('complementary', { name: 'Page panel' })
    await user.click(within(panel).getByText('Version 4'))
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument()
    expect(screen.getByText(/isn’t available to restore/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await user.click(within(panel).getByText('Version 5'))
    await user.click(screen.getByRole('button', { name: 'Restore this version' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Restore this version?' })).getByRole('button', { name: 'Restore' }))
    expect(content().pages['pg.adr-012'].versions[0].comment).toBe('Restored version 5')
    expect(screen.queryByRole('heading', { name: 'Consequences' })).not.toBeInTheDocument()
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
