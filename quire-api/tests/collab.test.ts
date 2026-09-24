import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { COLLAB_FIELD, collabDocumentName } from '@quire/editor'
import { MEMBERS_GROUP_ID, type PageDto } from '@quire/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { htmlToYState, yDocToHtml } from '../src/collab.ts'
import * as t from '../src/db/schema.ts'
import { signedIn, testApp, WEB_ORIGIN, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'

/** Real-time co-editing over real WebSockets: two editors, one server, the database underneath. */

type Person = Client & { user: { id: string } }

let app: ReturnType<typeof testApp>
let server: Server
let url: string
let owner: Person
let member: Person
const open: HocuspocusProvider[] = []

const body = async <T>(res: Response) => (await res.json()) as T
const db = () => testDb().db
const cookieOf = (c: Client) => [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ')

/** A Node WebSocket that sends a browser's cookie and origin. */
function socketFor(cookie: string, origin = WEB_ORIGIN) {
  return class extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { headers: { cookie, origin } })
    }
  }
}

function connect(who: Client, pageId: string, { origin }: { origin?: string } = {}) {
  const document = new Y.Doc()
  const websocketProvider = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: socketFor(cookieOf(who), origin), maxAttempts: 1 })
  const events: string[] = []
  let failed = ''
  const provider = new HocuspocusProvider({
    websocketProvider,
    name: collabDocumentName(pageId),
    document,
    token: 'session-cookie',
    onStateless: ({ payload }) => void events.push(JSON.parse(payload).type),
    onAuthenticationFailed: ({ reason }) => void (failed = reason),
  })
  // A socket created separately isn't managed by the provider: attach it explicitly.
  provider.attach()
  open.push(provider)
  const synced = new Promise<void>((resolve) => provider.on('synced', () => resolve()))
  return { provider, document, events, synced, failed: () => failed, text: () => document.getXmlFragment(COLLAB_FIELD).toString() }
}

/** Type into a document the way the editor would: append a paragraph. */
function appendParagraph(document: Y.Doc, text: string) {
  const fragment = document.getXmlFragment(COLLAB_FIELD)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  fragment.push([p])
}

const until = async (check: () => boolean, timeout = 3000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

beforeEach(async () => {
  app = testApp()
  await db().insert(t.groups).values({ id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true })
  owner = await signedIn(app, { name: 'Olive Owner' })
  member = await signedIn(app, { name: 'Max Member' })
  await owner.post('/api/spaces', { key: 'ENG', name: 'Engineering' })
  server = serve({ fetch: app.fetch, port: 0 }) as Server
  app.collab.attach(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/collab`
})

afterEach(async () => {
  for (const p of open.splice(0)) {
    p.destroy()
    p.configuration.websocketProvider.destroy()
  }
  await app.collab.destroy()
  await new Promise((r) => server.close(r))
})

async function publishedPage(html = '<p>Hello</p>') {
  const draft = await body<PageDto>(await owner.post('/api/pages', { spaceKey: 'ENG', title: 'Doc', html }))
  return body<PageDto>(await owner.post(`/api/pages/${draft.id}/publish`, {}, { 'if-match': '0' }))
}

describe('converting between HTML and Yjs', () => {
  it('round-trips the editor schema, custom nodes included', () => {
    // What the editor produces, mention attributes included.
    const html = '<h2>Title</h2><div data-callout="warning"><p>Careful</p></div><p><span userid="u.1" name="Ada" class="mention" data-mention="u.1">@Ada</span> <strong>bold</strong></p>'
    const doc = new Y.Doc()
    Y.applyUpdate(doc, htmlToYState(html))
    const out = yDocToHtml(doc)
    expect(out).toContain('<h2>Title</h2>')
    expect(out).toContain('<div data-callout="warning"><p>Careful</p></div>')
    expect(out).toContain('data-mention="u.1"')
    expect(out).toContain('<strong>bold</strong>')
  })
})

describe('co-editing', () => {
  it('refuses people without a session, from another origin, or who can only view', async () => {
    const page = await publishedPage()
    const anonymous = connect({ jar: new Map() } as unknown as Client, page.id)
    await until(() => anonymous.failed() !== '')

    const foreign = connect(owner, page.id, { origin: 'https://evil.example' })
    await new Promise((r) => setTimeout(r, 300))
    expect(foreign.provider.isSynced).toBe(false)

    await owner.put('/api/spaces/ENG/permissions', {
      grants: [{ principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: ['View', 'Comment'] }],
    })
    const viewer = connect(member, page.id)
    await until(() => viewer.failed() !== '')
  })

  it('starts from the published body and shares edits between editors', async () => {
    const page = await publishedPage('<p>Hello</p>')
    const a = connect(owner, page.id)
    const b = connect(member, page.id)
    await Promise.all([a.synced, b.synced])
    expect(a.text()).toContain('Hello')

    appendParagraph(a.document, 'From A')
    await until(() => b.text().includes('From A'))
    appendParagraph(b.document, 'From B')
    await until(() => a.text().includes('From B'))
  })

  it('stores the document as the draft, and the next session picks up where it left off', async () => {
    const page = await publishedPage()
    const a = connect(owner, page.id)
    await a.synced
    appendParagraph(a.document, 'Saved by co-editing')
    await until(() => !a.provider.hasUnsyncedChanges)
    await app.collab.flush(page.id)

    const [draft] = await db().select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, page.id))
    expect(draft.html).toContain('Saved by co-editing')
    expect(draft.ystate).toBeInstanceOf(Uint8Array)
    expect(draft.updatedById).toBe(owner.user.id)
    expect((await body<PageDto>(await member.get(`/api/pages/${page.id}`))).draft?.html).toContain('Saved by co-editing')

    // A new server (a restart) loads the stored Yjs state rather than re-parsing HTML.
    await app.collab.destroy()
    const fresh = testApp()
    const other = serve({ fetch: fresh.fetch, port: 0 }) as Server
    fresh.collab.attach(other)
    await new Promise<void>((resolve) => other.once('listening', () => resolve()))
    url = `ws://127.0.0.1:${(other.address() as AddressInfo).port}/collab`
    const again = connect(member, page.id)
    await again.synced
    expect(again.text()).toContain('Saved by co-editing')
    // The server only closes once its sockets are gone.
    again.provider.destroy()
    again.provider.configuration.websocketProvider.destroy()
    await fresh.collab.destroy()
    await new Promise((r) => other.close(r))
  })

  it('publishes what editors see right now, and tells them', async () => {
    const page = await publishedPage()
    const a = connect(owner, page.id)
    await a.synced
    appendParagraph(a.document, 'Just typed')
    await until(() => !a.provider.hasUnsyncedChanges)
    // No debounce wait: publishing flushes the open document first.
    const res = await owner.post(`/api/pages/${page.id}/publish`, {}, { 'if-match': `${page.lockVersion}` })
    expect(res.status).toBe(200)
    expect((await body<PageDto>(res)).publishedHtml).toContain('Just typed')
    await until(() => a.events.includes('published'))

    // Nothing new after publishing, so a later store doesn't invent unpublished changes.
    await app.collab.flush(page.id)
    expect((await body<PageDto>(await owner.get(`/api/pages/${page.id}`))).draft).toBeNull()
  })

  it('discarding the draft puts open editors back on the published body', async () => {
    const page = await publishedPage('<p>Published</p>')
    const a = connect(owner, page.id)
    await a.synced
    appendParagraph(a.document, 'Throwaway')
    await until(() => !a.provider.hasUnsyncedChanges)
    await app.collab.flush(page.id)
    expect((await owner.delete(`/api/pages/${page.id}/draft`)).status).toBe(204)
    await until(() => !a.text().includes('Throwaway') && a.events.includes('discarded'))
    await app.collab.flush(page.id)
    expect((await db().select().from(t.pageDrafts).where(eq(t.pageDrafts.pageId, page.id))).length).toBe(0)
  })

  it('tells open editors about moves and trash', async () => {
    const page = await publishedPage()
    const a = connect(owner, page.id)
    await a.synced
    await owner.post(`/api/pages/${page.id}/move`, { parentId: null, index: 0 })
    await owner.post(`/api/pages/${page.id}/archive`)
    await until(() => a.events.includes('moved') && a.events.includes('archived'))
  })
})
