import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
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

const { useContentStore } = await import('../src/store/contentStore')
const { useUIStore } = await import('../src/store/uiStore')
const initialContent = useContentStore.getState()
const initialUI = useUIStore.getState()

beforeEach(() => {
  localStorage.clear()
  useContentStore.setState(initialContent, true)
  useUIStore.setState(initialUI, true)
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
