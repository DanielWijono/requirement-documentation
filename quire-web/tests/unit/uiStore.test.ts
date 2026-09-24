import { describe, expect, it, vi } from 'vitest'
import { UI_STORAGE_KEY, useUIStore } from '../../src/store/uiStore'

const ui = () => useUIStore.getState()

describe('uiStore', () => {
  it('clamps nav width to 240–400', () => {
    ui().setNavWidth(100)
    expect(ui().navWidth).toBe(240)
    ui().setNavWidth(900)
    expect(ui().navWidth).toBe(400)
    ui().setNavWidth(300)
    expect(ui().navWidth).toBe(300)
  })

  it('opens, toggles and closes the right panel on a tab', () => {
    ui().openRightPanel('history')
    expect(ui()).toMatchObject({ rightPanelOpen: true, rightPanelTab: 'history' })
    ui().toggleRightPanel()
    expect(ui().rightPanelOpen).toBe(false)
    ui().toggleRightPanel()
    ui().closeRightPanel()
    expect(ui().rightPanelOpen).toBe(false)
  })

  it('auto-dismisses non-persistent toasts after 5s', () => {
    vi.useFakeTimers()
    ui().pushToast({ message: 'a', tone: 'info' })
    ui().pushToast({ message: 'b', tone: 'info', persistent: true })
    expect(ui().toasts).toHaveLength(2)
    vi.advanceTimersByTime(5000)
    expect(ui().toasts.map((t) => t.message)).toEqual(['b'])
    ui().dismissToast(ui().toasts[0].id)
    expect(ui().toasts).toHaveLength(0)
  })

  it('sets appearance preferences and toggles nav', () => {
    ui().setTheme('dark')
    ui().setDensity('compact')
    ui().setReadingFont('sans')
    const collapsed = ui().navCollapsed
    ui().toggleNav()
    expect(ui()).toMatchObject({ theme: 'dark', density: 'compact', readingFont: 'sans', navCollapsed: !collapsed })
  })

  it('saves only UI preferences, not session state, and restores them after a reload', async () => {
    ui().setTheme('dark')
    ui().setDensity('compact')
    ui().setNavWidth(320)
    ui().openRightPanel('history')
    ui().pushToast({ message: 'x', tone: 'info', persistent: true })
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!).state
    expect(saved).toEqual({ theme: 'dark', density: 'compact', readingFont: 'serif', navWidth: 320 })
    // A reload: memory starts over, storage keeps what was saved.
    const stored = localStorage.getItem(UI_STORAGE_KEY)!
    useUIStore.setState({ theme: 'system', density: 'comfortable', navWidth: 280 })
    localStorage.setItem(UI_STORAGE_KEY, stored)
    await useUIStore.persist.rehydrate()
    expect(ui()).toMatchObject({ theme: 'dark', density: 'compact', navWidth: 320 })
  })
})
