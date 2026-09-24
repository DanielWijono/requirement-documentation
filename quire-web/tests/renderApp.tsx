import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { clearCookies } from './cookies'
import { testQueryClient } from './testQueryClient'

/**
 * Render the whole app at `path`. By default the seeded admin is signed in and the session is
 * already in the cache, so screens render on the first pass like they did before the API.
 * `prefetch: false` leaves people and spaces to load through the fake, for loading and error states.
 */
export function renderApp(path = '/', { signedIn = true, prefetch = true }: { signedIn?: boolean; prefetch?: boolean } = {}) {
  window.history.pushState({}, '', path)
  const queryClient = testQueryClient({ signedIn, prefetch })
  if (!signedIn) clearCookies()
  const user = userEvent.setup()
  return { user, queryClient, ...render(<App queryClient={queryClient} />) }
}
