import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Before the API, content lived in this browser's storage; it is stale now, so drop it.
try {
  localStorage.removeItem('quire.content')
} catch {
  // Storage can be unavailable (private mode); nothing to clean up then.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
