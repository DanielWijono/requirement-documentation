import { describe, expect, it } from 'vitest'
import { ancestorChainIn, findTreeNodeIn, useContentStore } from '../../src/store/contentStore'

const store = () => useContentStore.getState()

describe('contentStore', () => {
  it('deleteSpace forgets the space’s pages and tree', () => {
    store().deleteSpace('sp.people')
    expect(store().pages['pg.benefits']).toBeUndefined()
    expect(store().pageTree['sp.people']).toBeUndefined()
  })

  it('seeds spaces, pages and trees from mock data', () => {
    expect(store().spaces.map((s) => s.id)).toEqual(['sp.eng', 'sp.product', 'sp.people', 'sp.legacy'])
    expect(store().pages['pg.adr-012'].title).toMatch(/ADR-012/)
    expect(store().pageTree['sp.eng'].length).toBeGreaterThan(0)
  })

  it('toggles page stars', () => {
    store().togglePageStar('pg.onboarding')
    expect(store().pages['pg.onboarding'].starred).toBe(true)
  })

  it('recordView moves page to front, dedupes and caps at 8', () => {
    store().recordView('pg.q3-plan', 'sp.product')
    const rv = store().recentlyViewed
    expect(rv[0]).toMatchObject({ pageId: 'pg.q3-plan', relativeTime: 'Just now' })
    expect(rv.filter((r) => r.pageId === 'pg.q3-plan')).toHaveLength(1)

    const ids = Object.keys(store().pages).slice(0, 12)
    ids.forEach((id) => store().recordView(id, 'sp.eng'))
    expect(store().recentlyViewed).toHaveLength(8)
  })

  it('createPage adds a draft at root or under a parent', () => {
    const rootId = store().createPage('sp.eng', null, 'Root page')
    expect(store().pages[rootId]).toMatchObject({ title: 'Root page', state: 'draft', parentId: null, spaceId: 'sp.eng' })
    expect(store().pageTree['sp.eng'].at(-1)?.id).toBe(rootId)

    const childId = store().createPage('sp.eng', 'pg.architecture')
    expect(store().pages[childId].title).toBe('Untitled')
    const arch = findTreeNodeIn(store().pageTree['sp.eng'], 'pg.architecture')
    expect(arch?.children.map((c) => c.id)).toContain(childId)
    expect(rootId).not.toBe(childId)
  })

  describe('saveContent', () => {
    it('saving a draft without publishing keeps it a draft and adds no version', () => {
      store().saveContent('pg.new-draft', '<p>hi</p>', { publish: false })
      const p = store().pages['pg.new-draft']
      expect(p.state).toBe('draft')
      expect(p.contentHtml).toBe('<p>hi</p>')
      expect(p.versions).toHaveLength(0)
    })

    it('saving a published page without publishing marks unpublished changes in page and tree', () => {
      store().saveContent('pg.onboarding', '<p>x</p>', { publish: false })
      expect(store().pages['pg.onboarding'].state).toBe('published-unpublished-changes')
      expect(findTreeNodeIn(store().pageTree['sp.eng'], 'pg.onboarding')?.state).toBe('published-unpublished-changes')
    })

    it('publishing bumps the version and marks only the new one current', () => {
      store().saveContent('pg.onboarding', '<p>x</p>', { publish: true, comment: 'Tweak' })
      const v = store().pages['pg.onboarding'].versions
      expect(v[0]).toMatchObject({ version: 3, comment: 'Tweak', current: true })
      expect(v.filter((x) => x.current)).toHaveLength(1)
      expect(store().pages['pg.onboarding'].state).toBe('published')
    })

    it('publishing a never-published draft starts at version 1 with default comment', () => {
      store().saveContent('pg.new-draft', '<p>x</p>', { publish: true })
      expect(store().pages['pg.new-draft'].versions[0]).toMatchObject({ version: 1, comment: 'Published' })
    })

    it('ignores unknown page ids', () => {
      const before = store().pages
      store().saveContent('nope', '<p/>', { publish: true })
      expect(store().pages).toBe(before)
    })
  })

  it('updatePageMeta patches fields', () => {
    store().updatePageMeta('pg.onboarding', { title: 'Renamed', widthMode: 'wide' })
    expect(store().pages['pg.onboarding']).toMatchObject({ title: 'Renamed', widthMode: 'wide' })
  })

  it('addComment prepends and toggleResolveComment flips resolved', () => {
    store().addComment('pg.adr-012', 'New one', 'anchor')
    const c = store().pages['pg.adr-012'].comments[0]
    expect(c).toMatchObject({ body: 'New one', anchorText: 'anchor', authorId: 'u.daniel' })

    store().toggleResolveComment('pg.adr-012', c.id)
    expect(store().pages['pg.adr-012'].comments[0].resolved).toBe(true)
    store().toggleResolveComment('pg.adr-012', c.id)
    expect(store().pages['pg.adr-012'].comments[0].resolved).toBe(false)
  })

  it('restoreVersion republishes the snapshot as a new current version', () => {
    const { pages } = store()
    const top = pages['pg.adr-012'].versions[0].version
    const v5 = pages['pg.adr-012'].versions.find((v) => v.version === 5)!
    store().restoreVersion('pg.adr-012', 5)
    const page = store().pages['pg.adr-012']
    expect(page.versions[0]).toMatchObject({ version: top + 1, comment: 'Restored version 5', current: true })
    expect(page.versions.filter((x) => x.current)).toHaveLength(1)
    expect(page.contentHtml).toBe(v5.contentHtml)
    expect(page.publishedHtml).toBe(v5.contentHtml)
    expect(page.state).toBe('published')
  })

  it('restoreVersion is a no-op for unknown versions or versions without a snapshot', () => {
    const before = store().pages['pg.adr-012']
    store().restoreVersion('pg.adr-012', 999)
    store().restoreVersion('pg.adr-012', 4)
    expect(store().pages['pg.adr-012']).toBe(before)
  })

  it('seed pages carry a published body and a snapshot on their current version', () => {
    const page = store().pages['pg.onboarding']
    expect(page.publishedHtml).toBe(page.contentHtml)
    expect(page.versions.find((v) => v.current)?.contentHtml).toBe(page.contentHtml)
    expect(store().pages['pg.new-draft'].publishedHtml).toBeUndefined()
    const adr = store().pages['pg.adr-012']
    expect(adr.publishedHtml).not.toBe(adr.contentHtml)
    expect(adr.versions[0].current).toBe(true)
  })

  it('discardChanges reverts to the published body without adding a version', () => {
    const adr = store().pages['pg.adr-012']
    store().discardChanges('pg.adr-012')
    const after = store().pages['pg.adr-012']
    expect(after.contentHtml).toBe(adr.publishedHtml)
    expect(after.state).toBe('published')
    expect(after.versions).toHaveLength(adr.versions.length)
    expect(findTreeNodeIn(store().pageTree['sp.eng'], 'pg.adr-012')?.state).toBe('published')
  })

  it('saving content identical to the published body clears the unpublished state', () => {
    const published = store().pages['pg.adr-012'].publishedHtml!
    store().saveContent('pg.adr-012', published, { publish: false })
    expect(store().pages['pg.adr-012'].state).toBe('published')
  })

  it('addReply appends a reply to the thread', () => {
    store().addReply('pg.adr-012', 'c1', 'Agreed')
    const replies = store().pages['pg.adr-012'].comments.find((c) => c.id === 'c1')!.replies!
    expect(replies.at(-1)).toMatchObject({ body: 'Agreed', authorId: 'u.daniel' })
    expect(replies).toHaveLength(2)
  })

  it('updatePageMeta keeps the tree title in sync', () => {
    store().updatePageMeta('pg.onboarding', { title: 'Welcome' })
    expect(findTreeNodeIn(store().pageTree['sp.eng'], 'pg.onboarding')?.title).toBe('Welcome')
  })

  describe('movePage', () => {
    it('moves a page and its subtree under a new parent', () => {
      expect(store().movePage('pg.architecture', 'pg.runbooks')).toBe(true)
      const tree = store().pageTree['sp.eng']
      expect(ancestorChainIn(tree, 'pg.adr-012').map((n) => n.id)).toEqual(['pg.runbooks', 'pg.architecture', 'pg.adr-012'])
      expect(store().pages['pg.architecture'].parentId).toBe('pg.runbooks')
    })

    it('moves to the space root', () => {
      store().movePage('pg.onboarding', null)
      expect(store().pageTree['sp.eng'].at(-1)?.id).toBe('pg.onboarding')
    })

    it('refuses to move a page under its own descendant', () => {
      expect(store().movePage('pg.handbook', 'pg.adr-012')).toBe(false)
      expect(findTreeNodeIn(store().pageTree['sp.eng'], 'pg.handbook')).toBeDefined()
    })
  })

  it('copyPage creates a draft sibling with the same body', () => {
    const id = store().copyPage('pg.onboarding')!
    const copy = store().pages[id]
    expect(copy).toMatchObject({ title: 'Copy of Onboarding', state: 'draft', parentId: 'pg.handbook' })
    expect(copy.contentHtml).toBe(store().pages['pg.onboarding'].contentHtml)
  })

  it('deletePage hides the subtree and restorePage brings the page back under its parent', () => {
    store().deletePage('pg.architecture')
    expect(store().pages['pg.architecture'].state).toBe('deleted')
    expect(store().pages['pg.service-map'].state).toBe('deleted')
    store().restorePage('pg.architecture')
    const tree = store().pageTree['sp.eng']
    expect(store().pages['pg.architecture'].state).toBe('published')
    expect(ancestorChainIn(tree, 'pg.architecture').map((n) => n.id)).toEqual(['pg.handbook', 'pg.architecture'])
  })

  it('restorePage falls back to the space root when the parent is gone', () => {
    store().archivePage('pg.onboarding')
    store().archivePage('pg.handbook')
    store().restorePage('pg.onboarding')
    expect(store().pageTree['sp.eng'].some((n) => n.id === 'pg.onboarding')).toBe(true)
    expect(store().pages['pg.onboarding'].parentId).toBeNull()
  })

  it('archivePage marks the subtree archived and removes it from the nav tree', () => {
    store().archivePage('pg.architecture')
    expect(store().pages['pg.architecture'].state).toBe('archived')
    expect(store().pages['pg.adr-012'].state).toBe('archived')
    const tree = store().pageTree['sp.eng']
    expect(findTreeNodeIn(tree, 'pg.architecture')).toBeUndefined()
    expect(findTreeNodeIn(tree, 'pg.adr-012')).toBeUndefined()
  })

  it('ancestorChainIn returns root-to-node path, empty when missing', () => {
    const chain = ancestorChainIn(store().pageTree['sp.eng'], 'pg.adr-012').map((n) => n.id)
    expect(chain).toEqual(['pg.handbook', 'pg.architecture', 'pg.adr-012'])
    expect(ancestorChainIn(store().pageTree['sp.eng'], 'missing')).toEqual([])
  })

  it('does not mutate the mock seed data', async () => {
    const { pages } = await import('../../src/data/mockData')
    store().updatePageMeta('pg.onboarding', { title: 'Mutated' })
    expect(pages['pg.onboarding'].title).toBe('Onboarding')
  })
})
