import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell/AppShell'
import { Home } from './routes/Home'
import { SpacesDirectory } from './routes/SpacesDirectory'
import { SpaceOverview } from './routes/SpaceOverview'
import { SpaceSettings } from './routes/SpaceSettings'
import { SpaceBlog } from './routes/SpaceBlog'
import { SpaceTemplates } from './routes/SpaceTemplates'
import { SpaceArchive } from './routes/SpaceArchive'
import { PageView } from './routes/PageView'
import { PageEdit } from './routes/PageEdit'
import { SearchResults } from './routes/SearchResults'
import { NotFound } from './routes/NotFound'
import { useUIStore } from './store/uiStore'

function useAppearanceEffects() {
  const theme = useUIStore((s) => s.theme)
  const density = useUIStore((s) => s.density)
  const readingFont = useUIStore((s) => s.readingFont)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
  }, [density])

  useEffect(() => {
    document.documentElement.setAttribute('data-reading-font', readingFont)
  }, [readingFont])
}

export default function App() {
  useAppearanceEffects()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/spaces" element={<SpacesDirectory />} />
          <Route path="/spaces/:spaceId" element={<SpaceOverview />} />
          <Route path="/spaces/:spaceId/blog" element={<SpaceBlog />} />
          <Route path="/spaces/:spaceId/templates" element={<SpaceTemplates />} />
          <Route path="/spaces/:spaceId/settings" element={<SpaceSettings />} />
          <Route path="/spaces/:spaceId/archive" element={<SpaceArchive />} />
          <Route path="/spaces/:spaceId/pages/:pageId" element={<PageView />} />
          <Route path="/spaces/:spaceId/pages/:pageId/edit" element={<PageEdit />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
