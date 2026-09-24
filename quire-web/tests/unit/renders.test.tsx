import { describe, expect, it } from 'vitest'
import { Profiler } from 'react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SpaceNav } from '../../src/components/nav/SpaceNav'
import { TopBar } from '../../src/components/shell/TopBar'
import { homeKeys } from '../../src/queries/home'
import { saveDraft } from '../../src/queries/pages'
import { testQueryClient } from '../testQueryClient'
import { fakeDb } from '../fakeApi/db'

/** Render `ui` on a space page route and count React commits inside it once its data has settled. */
async function renderCounting(ui: ReactNode) {
  const counter = { commits: 0 }
  const queryClient = testQueryClient({ path: '/spaces/sp.eng/pages/pg.onboarding' })
  render(
    <QueryClientProvider client={queryClient}>
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
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // Let the menus' own queries (recent, starred) land before counting.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  counter.commits = 0
  return { counter, queryClient }
}

async function autosaves(pageId: string, times = 5) {
  let rev = fakeDb.pages.get(pageId)!.draft?.rev
  for (let i = 0; i < times; i++) rev = (await saveDraft(pageId, `<p>edit ${i}</p>`, rev)).rev
  // Give any (unwanted) cache notification the tick it would need to render.
  await new Promise((r) => setTimeout(r, 20))
}

describe('autosave does not re-render the shell', () => {
  it('SpaceNav does not re-render while a page autosaves', async () => {
    const { counter } = await renderCounting(<SpaceNav />)
    await act(() => autosaves('pg.onboarding'))
    expect(counter.commits).toBe(0)
  })

  it('TopBar does not re-render on autosaves, only when what it shows changes', async () => {
    const { counter, queryClient } = await renderCounting(<TopBar />)
    await act(() => autosaves('pg.onboarding'))
    expect(counter.commits).toBe(0)
    const starred = { id: 'pg.x', title: 'Newly starred', icon: null, status: 'published', hasDraft: false, spaceId: 'sp.eng', spaceKey: 'ENG', spaceName: 'Engineering', updatedAt: new Date().toISOString(), updatedById: 'u.daniel', viewedAt: null }
    // React Query tells components about cache changes on the next tick.
    act(() => queryClient.setQueryData(homeKeys.starred, { spaces: [], pages: [starred] }))
    await waitFor(() => expect(counter.commits).toBe(1))
  })
})
