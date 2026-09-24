import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Hocuspocus } from '@hocuspocus/server'
import { COLLAB_FIELD, collabDocumentName, pageIdFromDocumentName, schemaExtensions } from '@quire/editor'
import { getSchema } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html/server'
import { prosemirrorJSONToYDoc, updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { eq, sql } from 'drizzle-orm'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import type { Auth } from './auth.ts'
import type { Db } from './db/client.ts'
import * as t from './db/schema.ts'
import type { Env } from './env.ts'
import { sanitizeBody } from './lib/sanitize.ts'
import { loadSubject, pageForSubject } from './services/access.ts'

/**
 * Real-time co-editing of drafts (Hocuspocus + Yjs), served on the API's own port at /collab.
 *
 * - Only people who can edit a page may open its document; the session cookie and the Origin
 *   header are checked on connect, just like REST writes.
 * - A document starts from the page's draft (or published body) and is stored back as the draft:
 *   the Yjs state for the next session plus sanitized HTML for reading, search and publishing.
 * - Routes that change a page underneath open editors call `notify` so editors can show what
 *   happened, `flush` before publishing, and `replace` when the draft is discarded or an old
 *   version restored (the open document becomes that content, live, for everyone in it).
 */

const extensions = schemaExtensions({ collaborative: true })
const schema = getSchema(extensions)

export interface CollabContext {
  userId: string
  name: string
}

/** Something that happened to a page that its open editors should hear about (§9.3). */
export interface StructuralEvent {
  type: 'published' | 'moved' | 'archived' | 'deleted' | 'restored' | 'discarded' | 'restricted'
  byUserId: string
}

export function htmlToYState(html: string): Uint8Array {
  const doc = prosemirrorJSONToYDoc(schema, generateJSON(html, extensions), COLLAB_FIELD)
  return Y.encodeStateAsUpdate(doc)
}

export function yDocToHtml(doc: Y.Doc): string {
  return sanitizeBody(generateHTML(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(COLLAB_FIELD)), extensions))
}

export function createCollab({ db, env, auth }: { db: Db; env: Env; auth: Auth }) {
  const hocuspocus = new Hocuspocus<CollabContext>({
    quiet: true,
    debounce: 2000,
    maxDebounce: 10_000,

    async onAuthenticate({ documentName, requestHeaders }) {
      const pageId = pageIdFromDocumentName(documentName)
      if (!pageId) throw new Error('Unknown document')
      const session = await auth.api.getSession({ headers: requestHeaders })
      const user = session?.user
      if (!user || user.deactivatedAt) throw new Error('Sign in to continue')
      const subject = await loadSubject(db, { id: user.id, siteRole: user.siteRole === 'admin' ? 'admin' : 'member' })
      const page = await pageForSubject(db, subject, pageId)
      if (!page.access.edit) throw new Error('You cannot edit this page')
      return { userId: user.id, name: user.name }
    },

    async onLoadDocument({ documentName, document }) {
      const pageId = pageIdFromDocumentName(documentName)!
      const [row] = await db
        .select({ draftHtml: t.pageDrafts.html, ystate: t.pageDrafts.ystate, publishedHtml: t.pages.publishedHtml })
        .from(t.pages)
        .leftJoin(t.pageDrafts, eq(t.pageDrafts.pageId, t.pages.id))
        .where(eq(t.pages.id, pageId))
      if (!row) return document
      Y.applyUpdate(document, row.ystate ?? htmlToYState(row.draftHtml ?? row.publishedHtml ?? '<p></p>'))
      return document
    },

    async onStoreDocument({ documentName, document, lastContext }) {
      await storeDraft(pageIdFromDocumentName(documentName)!, document, lastContext?.userId)
    },
  })

  // Stores that have started and not finished, so shutting down can wait for them.
  const inflight = new Set<Promise<void>>()

  function storeDraft(pageId: string, document: Y.Doc, userId: string | undefined): Promise<void> {
    const run = writeDraft(pageId, document, userId)
    inflight.add(run)
    void run.finally(() => inflight.delete(run)).catch(() => undefined)
    return run
  }

  async function writeDraft(pageId: string, document: Y.Doc, userId: string | undefined) {
    const html = yDocToHtml(document)
    const ystate = Y.encodeStateAsUpdate(document)
    await db.transaction(async (tx) => {
      // Stores of one page (debounced, flushed, on unload) queue here rather than racing on the draft row.
      const [page] = await tx.select({ publishedHtml: t.pages.publishedHtml, ownerId: t.pages.ownerId }).from(t.pages).where(eq(t.pages.id, pageId)).for('update')
      if (!page) return
      const [existing] = await tx.select({ html: t.pageDrafts.html }).from(t.pageDrafts).where(eq(t.pageDrafts.pageId, pageId))
      // Nothing changed since the last publish: don't turn an untouched page into one with "unpublished changes".
      if (!existing && html === page.publishedHtml) return
      if (existing?.html === html) return
      const updatedById = userId ?? page.ownerId
      await tx
        .insert(t.pageDrafts)
        .values({ pageId, html, ystate, updatedById })
        .onConflictDoUpdate({
          target: t.pageDrafts.pageId,
          set: { html, ystate, rev: sql`${t.pageDrafts.rev} + 1`, updatedById, updatedAt: new Date() },
        })
    })
  }

  const wss = new WebSocketServer({ noServer: true })

  /** Accept WebSocket upgrades on /collab from the web origin; everything else is refused. */
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/collab')) return false
    // Cookies ride along on cross-site WebSocket requests, so the origin is what stops hijacking.
    if (req.headers.origin !== env.WEB_ORIGIN) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return true
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const connection = hocuspocus.handleConnection(ws, new Request(`http://localhost${req.url}`, { headers }))
      ws.on('message', (data: Buffer) => connection.handleMessage(new Uint8Array(data)))
      ws.on('close', (code, reason) => connection.handleClose({ code, reason: reason.toString() }))
    })
    return true
  }

  return {
    hocuspocus,

    attach(server: Server) {
      server.on('upgrade', (req, socket, head) => {
        if (!handleUpgrade(req, socket, head)) socket.destroy()
      })
    },

    /** Write an open document back to the draft now, e.g. right before publishing it. */
    async flush(pageId: string) {
      const document = hocuspocus.documents.get(collabDocumentName(pageId))
      if (document) await storeDraft(pageId, document, undefined)
    },

    /** Tell a page's open editors that something changed underneath them. */
    notify(pageId: string, event: StructuralEvent) {
      hocuspocus.documents.get(collabDocumentName(pageId))?.broadcastStateless(JSON.stringify(event))
    },

    /** Make a page's editors reconnect, which checks again that they may still edit. */
    recheck(pageId: string) {
      hocuspocus.closeConnections(collabDocumentName(pageId))
    },

    /**
     * Make an open document read `html` (the published body after a discard, an old version after a
     * restore). Everyone in it sees the change at once; a store afterwards finds nothing new to save.
     */
    replace(pageId: string, html: string) {
      const document = hocuspocus.documents.get(collabDocumentName(pageId))
      if (!document) return
      const node = schema.nodeFromJSON(generateJSON(html, extensions))
      updateYFragment(document, document.getXmlFragment(COLLAB_FIELD), node, { mapping: new Map(), isOMark: new Map() })
    },

    /** Close every editor, write what they had, and stop. Resolves once nothing is still being stored. */
    async destroy() {
      hocuspocus.closeConnections()
      hocuspocus.flushPendingStores()
      // Stores start a few ticks after the connections close; wait until none are left.
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve))
        await Promise.allSettled([...inflight])
      }
      wss.close()
    },
  }
}

export type Collab = ReturnType<typeof createCollab>
