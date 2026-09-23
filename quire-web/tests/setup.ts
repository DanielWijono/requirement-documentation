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
