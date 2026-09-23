import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

export function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  const user = userEvent.setup()
  return { user, ...render(<App />) }
}
