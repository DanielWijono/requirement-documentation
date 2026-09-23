import { describe, expect, it } from 'vitest'
import { Profiler } from 'react'
import type { ReactNode } from 'react'
import { act, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useContentStore } from '../../src/store/contentStore'
import { SpaceNav } from '../../src/components/nav/SpaceNav'
import { TopBar } from '../../src/components/shell/TopBar'

const content = () => useContentStore.getState()

/** Render `ui` on a space page route and count React commits inside it. */
function renderCounting(ui: ReactNode) {
  const counter = { commits: 0 }
  render(
    <MemoryRouter initialEntries={['/spaces/sp.eng/pages/pg.onboarding']}>
      <Routes>
        <Route
          path="/spaces/:spaceId/pages/:pageId"
          element={
            <Profiler id="probe" onRender={() => counter.commits++}>
              {ui}
            </Profiler>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  counter.commits = 0
  return counter
}

describe('autosave does not re-render the shell', () => {
  it('store: saving without a state change keeps the tree reference', () => {
    content().saveContent('pg.onboarding', '<p>typing…</p>', { publish: false })
    const tree = content().pageTree
    content().saveContent('pg.onboarding', '<p>typing more…</p>', { publish: false })
    expect(content().pageTree).toBe(tree)
    content().updatePageMeta('pg.onboarding', { title: content().pages['pg.onboarding'].title })
    expect(content().pageTree).toBe(tree)
  })

  it('SpaceNav does not re-render on autosaves of another page', () => {
    content().saveContent('pg.runbooks', '<p>first</p>', { publish: false }) // state flips once
    const counter = renderCounting(<SpaceNav />)
    act(() => {
      for (let i = 0; i < 5; i++) content().saveContent('pg.runbooks', `<p>edit ${i}</p>`, { publish: false })
    })
    expect(counter.commits).toBe(0)
  })

  it('TopBar does not re-render on autosaves, only when what it shows changes', () => {
    const counter = renderCounting(<TopBar />)
    act(() => {
      for (let i = 0; i < 5; i++) content().saveContent('pg.onboarding', `<p>edit ${i}</p>`, { publish: false })
    })
    expect(counter.commits).toBe(0)
    act(() => content().togglePageStar('pg.onboarding'))
    expect(counter.commits).toBe(1)
  })
})
