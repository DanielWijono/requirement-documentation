import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no matchMedia; uiStore reads it at import time. Default to a desktop viewport.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom lacks layout APIs that ProseMirror calls on pointer events.
if (!document.elementFromPoint) document.elementFromPoint = () => null
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const { fakeDb, SEED_ADMIN_ID, SESSION_COOKIE } = await import('./fakeApi/db')
const { server } = await import('./fakeApi/server')
const { clearCookies } = await import('./cookies')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const { useUIStore } = await import('../src/store/uiStore')
const initialUI = useUIStore.getState()

beforeEach(() => {
  // Each test starts as the seeded admin in a signed-in browser, like the demo data does.
  fakeDb.reset()
  clearCookies()
  document.cookie = `${SESSION_COOKIE}=${fakeDb.createSession(SEED_ADMIN_ID)}; Path=/`
  localStorage.clear()
  useUIStore.setState(initialUI, true)
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.useRealTimers()
})
