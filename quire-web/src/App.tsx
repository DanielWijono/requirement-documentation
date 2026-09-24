import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell/AppShell'
import { RequireSession } from './components/shell/RequireSession'
import { createQueryClient } from './lib/queryClient'
import { AcceptInvite, ForgotPassword, Login, ResetPassword } from './routes/Auth'
import { AdminPeople } from './routes/AdminPeople'
import { Home } from './routes/Home'
import { SpacesDirectory } from './routes/SpacesDirectory'
import { SpaceOverview } from './routes/SpaceOverview'
import { SpaceSettings } from './routes/SpaceSettings'
import { SpaceBlog } from './routes/SpaceBlog'
import { SpaceTemplates } from './routes/SpaceTemplates'
import { SpaceArchive } from './routes/SpaceArchive'
import { PageView } from './routes/PageView'
import { SearchResults } from './routes/SearchResults'
import { NotFound } from './routes/NotFound'
import { useUIStore } from './store/uiStore'
import { PageSkeleton } from './components/ui/Skeleton'

// The editor (Tiptap + ProseMirror) is most of the bundle and only needed in write mode.
const PageEdit = lazy(() => import('./routes/PageEdit').then((m) => ({ default: m.PageEdit })))

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

export default function App({ queryClient }: { queryClient?: QueryClient }) {
  useAppearanceEffects()
  const [client] = useState(() => queryClient ?? createQueryClient())

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route
            element={
              <RequireSession>
                <AppShell />
              </RequireSession>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/spaces" element={<SpacesDirectory />} />
            <Route path="/spaces/:spaceId" element={<SpaceOverview />} />
            <Route path="/spaces/:spaceId/blog" element={<SpaceBlog />} />
            <Route path="/spaces/:spaceId/templates" element={<SpaceTemplates />} />
            <Route path="/spaces/:spaceId/settings" element={<SpaceSettings />} />
            <Route path="/spaces/:spaceId/archive" element={<SpaceArchive />} />
            <Route path="/spaces/:spaceId/pages/:pageId" element={<PageView />} />
            <Route
              path="/spaces/:spaceId/pages/:pageId/edit"
              element={
                <Suspense fallback={<PageSkeleton />}>
                  <PageEdit />
                </Suspense>
              }
            />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/admin/people" element={<AdminPeople />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
