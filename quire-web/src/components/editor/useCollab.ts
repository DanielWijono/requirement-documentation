import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider'
import { collabDocumentName } from '@quire/editor'
import type { UserDto } from '@quire/shared'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { avatarColor } from '../../lib/avatarColor'

/** Co-editing is on unless turned off for a build; the jsdom tests have no WebSocket server, so they use plain saves. */
export function collabEnabled(): boolean {
  return import.meta.env.MODE !== 'test' && import.meta.env.VITE_COLLAB !== 'false'
}

export function collabUrl(location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`
}

/** Something that happened to the page under its editors, sent by the API (see quire-api/src/collab.ts). */
export interface CollabEvent {
  type: 'published' | 'moved' | 'archived' | 'deleted' | 'restored' | 'discarded' | 'restricted'
  byUserId: string
}

export interface Peer {
  clientId: number
  userId: string
  name: string
  color: string
}

/** 'saved': the server has every change. 'saving': changes on their way. 'offline': not connected. */
export type CollabStatus = 'saved' | 'saving' | 'offline'

export interface CollabSession {
  document: Y.Doc
  provider: HocuspocusProvider
  status: CollabStatus
  peers: Peer[]
  events: CollabEvent[]
  /** True once the first sync with the server has finished. */
  synced: boolean
}

export function statusOf(connected: boolean, unsynced: number): CollabStatus {
  if (!connected) return 'offline'
  return unsynced > 0 ? 'saving' : 'saved'
}

/** Other people in the document, one entry per person, from the awareness states. */
export function peersFrom(states: { clientId: number; user?: { id?: string; name?: string; color?: string } }[], selfClientId: number): Peer[] {
  const seen = new Set<string>()
  const peers: Peer[] = []
  for (const s of states) {
    if (s.clientId === selfClientId || !s.user?.id || seen.has(s.user.id)) continue
    seen.add(s.user.id)
    peers.push({ clientId: s.clientId, userId: s.user.id, name: s.user.name ?? 'Someone', color: s.user.color ?? avatarColor(0) })
  }
  return peers
}

/** Resolves when the server has every local change (true), or after `timeout` ms without that (false). */
export function whenSynced(provider: HocuspocusProvider, timeout = 5000): Promise<boolean> {
  if (!provider.hasUnsyncedChanges && provider.isSynced) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer)
      provider.off('unsyncedChanges', check)
      resolve(ok)
    }
    const check = () => {
      if (!provider.hasUnsyncedChanges && provider.isSynced) done(true)
    }
    const timer = setTimeout(() => done(false), timeout)
    provider.on('unsyncedChanges', check)
    provider.forceSync()
  })
}

/** Open the page's shared document for the signed-in person; null while co-editing is off. */
export function useCollabSession(pageId: string, me: UserDto, enabled: boolean): CollabSession | null {
  const [session, setSession] = useState<CollabSession | null>(null)

  useEffect(() => {
    if (!enabled) return
    const document = new Y.Doc()
    const provider = new HocuspocusProvider({ url: collabUrl(), name: collabDocumentName(pageId), document, token: 'session' })
    provider.setAwarenessField('user', { id: me.id, name: me.name, color: avatarColor(me.colorSeed) })
    let state: CollabSession = { document, provider, status: 'offline', peers: [], events: [], synced: false }
    const update = (patch: Partial<CollabSession>) => {
      state = { ...state, ...patch }
      setSession(state)
    }
    const refresh = () => update({ status: statusOf(provider.configuration.websocketProvider.status === WebSocketStatus.Connected, provider.unsyncedChanges) })
    provider.on('status', refresh)
    provider.on('unsyncedChanges', refresh)
    provider.on('synced', () => update({ synced: true, status: statusOf(true, provider.unsyncedChanges) }))
    provider.on('awarenessChange', ({ states }: { states: { clientId: number; user?: { id?: string; name?: string; color?: string } }[] }) =>
      update({ peers: peersFrom(states, document.clientID) }),
    )
    provider.on('stateless', ({ payload }: { payload: string }) => {
      try {
        update({ events: [...state.events, JSON.parse(payload) as CollabEvent] })
      } catch {
        // Not one of ours; ignore it.
      }
    })
    update({})
    return () => {
      provider.destroy()
      document.destroy()
      setSession(null)
    }
  }, [pageId, me.id, me.name, me.colorSeed, enabled])

  return session
}
