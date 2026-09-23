import { describe, expect, it } from 'vitest'
import { CONTENT_STORAGE_KEY, migrateContent, useContentStore } from '../../src/store/contentStore'
import { UI_STORAGE_KEY, useUIStore } from '../../src/store/uiStore'
import { pages as seedPages } from '../../src/data/mockData'

const content = () => useContentStore.getState()

/** Simulate a page reload: keep what is in storage, wipe in-memory state, then rehydrate. */
async function reload() {
  const saved = { content: localStorage.getItem(CONTENT_STORAGE_KEY), ui: localStorage.getItem(UI_STORAGE_KEY) }
  useContentStore.setState({ pages: {}, spaces: [], pageTree: {}, recentlyViewed: [] })
  useUIStore.setState({ theme: 'system', density: 'comfortable', navWidth: 280 })
  if (saved.content) localStorage.setItem(CONTENT_STORAGE_KEY, saved.content)
  if (saved.ui) localStorage.setItem(UI_STORAGE_KEY, saved.ui)
  await useContentStore.persist.rehydrate()
  await useUIStore.persist.rehydrate()
}

describe('persistence', () => {
  it('content changes survive a reload', async () => {
    const id = content().createPage('sp.eng', null, 'Persisted page')
    content().addComment('pg.onboarding', 'Saved comment')
    await reload()
    expect(content().pages[id].title).toBe('Persisted page')
    expect(content().pages['pg.onboarding'].comments[0].body).toBe('Saved comment')
    expect(content().pageTree['sp.eng'].some((n) => n.id === id)).toBe(true)
  })

  it('new ids after a reload never collide with saved ones', async () => {
    const first = content().createPage('sp.eng', null, 'A')
    await reload()
    const second = content().createPage('sp.eng', null, 'B')
    expect(second).not.toBe(first)
    expect(content().pages[first].title).toBe('A')
  })

  it('only UI preferences are saved, not session state', async () => {
    const ui = useUIStore.getState()
    ui.setTheme('dark')
    ui.setDensity('compact')
    ui.setNavWidth(320)
    ui.openRightPanel('history')
    ui.pushToast({ message: 'x', tone: 'info', persistent: true })
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!).state
    expect(saved).toEqual({ theme: 'dark', density: 'compact', readingFont: 'serif', navWidth: 320 })
    await reload()
    expect(useUIStore.getState()).toMatchObject({ theme: 'dark', density: 'compact', navWidth: 320 })
  })

  it('migrates v0 data that lacks published bodies and snapshots', async () => {
    const legacyPages = JSON.parse(JSON.stringify(seedPages))
    for (const p of Object.values(legacyPages) as { publishedHtml?: string }[]) delete p.publishedHtml
    const migrated = migrateContent({ spaces: [], pages: legacyPages, pageTree: {}, recentlyViewed: [] }, 0)
    expect(migrated.pages['pg.onboarding'].publishedHtml).toBe(migrated.pages['pg.onboarding'].contentHtml)
    expect(migrated.pages['pg.new-draft'].publishedHtml).toBeUndefined()

    localStorage.setItem(CONTENT_STORAGE_KEY, JSON.stringify({ version: 0, state: { spaces: [], pages: legacyPages, pageTree: {}, recentlyViewed: [] } }))
    await useContentStore.persist.rehydrate()
    expect(content().pages['pg.q3-plan'].publishedHtml).toBeDefined()
  })

  it('resetToSeed restores the demo data', () => {
    content().deletePage('pg.handbook')
    content().resetToSeed()
    expect(content().pages['pg.handbook'].state).toBe('published')
    expect(content().pageTree['sp.eng'][0].id).toBe('pg.handbook')
  })
})
