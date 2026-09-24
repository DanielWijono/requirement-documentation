import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../renderApp'
import { useUIStore } from '../../src/store/uiStore'

async function openVersion(label: string) {
  useUIStore.getState().openRightPanel('history')
  const r = renderApp('/spaces/sp.eng/pages/pg.adr-012')
  const panel = screen.getByRole('complementary', { name: 'Page panel' })
  await r.user.click(await within(panel).findByText(label))
  return r
}

describe('version compare (design.md §8.6)', () => {
  it('compares an older version with the current one using a real diff', async () => {
    await openVersion('Version 5')
    expect(await screen.findByText(/Version 5 → current/)).toBeInTheDocument()
    const unified = await screen.findByTestId('diff-unified')
    // v5 lacks the Consequences section that the current version has.
    expect(within(unified).getByText('Consequences')).toBeInTheDocument()
    expect(within(unified).getAllByText('Added:').length).toBeGreaterThan(0)
  })

  it('the current version compares with the previous version that has content', async () => {
    await openVersion('Version 6')
    expect(await screen.findByText(/Version 5 → Version 6/)).toBeInTheDocument()
  })

  it('versions without content say so instead of showing a fake diff', async () => {
    await openVersion('Version 4')
    expect(await screen.findByText(/isn’t available, so it can’t be compared/)).toBeInTheDocument()
    expect(screen.queryByTestId('diff-unified')).not.toBeInTheDocument()
  })

  it('side-by-side view shows removals on the left and additions on the right', async () => {
    await openVersion('Version 5')
    const split = await screen.findByTestId('diff-split')
    const [before, after] = [...split.children] as HTMLElement[]
    expect(within(before).queryByText('Consequences')).not.toBeInTheDocument()
    expect(within(after).getByText('Consequences')).toBeInTheDocument()
  })
})
