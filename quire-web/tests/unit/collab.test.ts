import { describe, expect, it } from 'vitest'
import { collabEnabled, collabUrl, peersFrom, statusOf } from '../../src/components/editor/useCollab'

describe('co-editing client helpers', () => {
  it('is off in tests, which have no WebSocket server', () => {
    expect(collabEnabled()).toBe(false)
  })

  it('connects to /collab on the page’s own host, securely under https', () => {
    expect(collabUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/collab')
    expect(collabUrl({ protocol: 'https:', host: 'quire.example.com' })).toBe('wss://quire.example.com/collab')
  })

  it('is saved only when connected with nothing left to send', () => {
    expect(statusOf(false, 0)).toBe('offline')
    expect(statusOf(true, 2)).toBe('saving')
    expect(statusOf(true, 0)).toBe('saved')
  })

  it('lists each other person once, not yourself', () => {
    const states = [
      { clientId: 1, user: { id: 'u.me', name: 'Me', color: '#000' } },
      { clientId: 2, user: { id: 'u.ada', name: 'Ada', color: '#111' } },
      { clientId: 3, user: { id: 'u.ada', name: 'Ada', color: '#111' } },
      { clientId: 4 },
    ]
    expect(peersFrom(states, 1)).toEqual([{ clientId: 2, userId: 'u.ada', name: 'Ada', color: '#111' }])
  })
})
