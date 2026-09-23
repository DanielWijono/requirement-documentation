import { describe, expect, it } from 'vitest'
import { ancestorChainIn, findTreeNodeIn, useContentStore } from '../../src/store/contentStore'

const store = () => useContentStore.getState()

describe('contentStore', () => {
  it('seeds spaces, pages and trees from mock data', () => {
    expect(store().spaces.map((s) => s.id)).toEqual(['sp.eng', 'sp.product', 'sp.people', 'sp.legacy'])
    expect(store().pages['pg.adr-012'].title).toMatch(/ADR-012/)
    expect(store().pageTree['sp.eng'].length).toBeGreaterThan(0)
  })

  it('toggles space and page stars', () => {
    store().toggleSpaceStar('sp.product')
    expect(store().spaces.find((s) => s.id === 'sp.product')?.starred).toBe(true)
    store().toggleSpaceStar('sp.product')
    expect(store().spaces.find((s) => s.id === 'sp.product')?.starred).toBe(false)

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

  it('createSpace uppercases key, defaults icon and creates an empty tree', () => {
    const id = store().createSpace({ name: 'Design', key: 'des', description: 'd', icon: '' })
    const sp = store().spaces.find((s) => s.id === id)
    expect(sp).toMatchObject({ name: 'Design', key: 'DES', icon: '📁', archived: false })
    expect(store().pageTree[id]).toEqual([])
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

  it('restoreVersion adds a new current version referencing the restored one', () => {
    const top = store().pages['pg.adr-012'].versions[0].version
    const target = store().pages['pg.adr-012'].versions.at(-1)!.version
    store().restoreVersion('pg.adr-012', target)
    const v = store().pages['pg.adr-012'].versions
    expect(v[0]).toMatchObject({ version: top + 1, comment: `Restored version ${target}`, current: true })
    expect(v.filter((x) => x.current)).toHaveLength(1)
  })

  it('restoreVersion is a no-op for unknown versions', () => {
    const before = store().pages['pg.adr-012']
    store().restoreVersion('pg.adr-012', 999)
    expect(store().pages['pg.adr-012']).toBe(before)
  })

  it('archivePage marks archived and removes it (and its subtree) from the nav tree', () => {
    store().archivePage('pg.architecture')
    expect(store().pages['pg.architecture'].state).toBe('archived')
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
