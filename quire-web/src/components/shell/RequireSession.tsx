import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { Button } from '../ui/Button'
import { PageSkeleton } from '../ui/Skeleton'

/** Everything inside needs a signed-in person; everyone else goes to sign in and comes back. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.isPending) return <PageSkeleton />
  if (session.isError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="t-content-h2">Can’t reach Quire</h1>
        <p className="t-ui-md text-(--color-text-secondary)">{session.error.message}</p>
        <Button variant="primary" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </main>
    )
  }
  if (!session.data) {
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
