import { create } from 'zustand'
import type { Density, ReadingFont, ThemePref } from '../types'

export type RightPanelTab = 'comments' | 'details' | 'history'

export interface Toast {
  id: string
  message: string
  tone: 'success' | 'info' | 'danger'
  actionLabel?: string
  persistent?: boolean
}

interface UIState {
  theme: ThemePref
  density: Density
  readingFont: ReadingFont
  navCollapsed: boolean
  navWidth: number
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  commandPaletteOpen: boolean
  toasts: Toast[]
  pendingCommentAnchor: string | null

  setTheme: (t: ThemePref) => void
  setDensity: (d: Density) => void
  setReadingFont: (f: ReadingFont) => void
  toggleNav: () => void
  setNavWidth: (w: number) => void
  openRightPanel: (tab: RightPanelTab) => void
  closeRightPanel: () => void
  toggleRightPanel: () => void
  setRightPanelTab: (tab: RightPanelTab) => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setPendingCommentAnchor: (text: string | null) => void
}

const startsWithNavCollapsed = typeof window !== 'undefined' && window.matchMedia('(max-width: 959px)').matches

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'system',
  density: 'comfortable',
  readingFont: 'serif',
  navCollapsed: startsWithNavCollapsed,
  navWidth: 280,
  rightPanelOpen: false,
  rightPanelTab: 'comments',
  commandPaletteOpen: false,
  toasts: [],
  pendingCommentAnchor: null,

  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setReadingFont: (readingFont) => set({ readingFont }),
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  setNavWidth: (navWidth) => set({ navWidth: Math.min(400, Math.max(240, navWidth)) }),
  openRightPanel: (tab) => set({ rightPanelOpen: true, rightPanelTab: tab }),
  closeRightPanel: () => set({ rightPanelOpen: false }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  pushToast: (t) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    if (!t.persistent) {
      setTimeout(() => get().dismissToast(id), 5000)
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPendingCommentAnchor: (text) => set({ pendingCommentAnchor: text }),
}))
