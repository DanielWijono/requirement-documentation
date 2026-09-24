import type { ReactNode } from 'react'
import { ApiError } from '../../lib/apiClient'
import { usePageQuery } from '../../queries/pages'
import { Forbidden } from '../../routes/Forbidden'
import { NotFound } from '../../routes/NotFound'
import type { Page } from '../../types'
import { Button } from '../ui/Button'
import { PageSkeleton } from '../ui/Skeleton'

/** The page a route shows, or what to show instead: skeleton, Not found (404), Forbidden (403) or a retry. */
export function usePageRoute(pageId: string | undefined): { page: Page; fallback: null } | { page: undefined; fallback: ReactNode } {
  const query = usePageQuery(pageId)
  if (query.data) return { page: query.data, fallback: null }
  if (query.isPending) return { page: undefined, fallback: <PageSkeleton /> }
  const err = query.error
  if (err instanceof ApiError && err.status === 404) return { page: undefined, fallback: <NotFound /> }
  if (err instanceof ApiError && err.status === 403) return { page: undefined, fallback: <Forbidden /> }
  return {
    page: undefined,
    fallback: (
      <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <h1 className="t-content-h2">Couldn’t load this page</h1>
        <p className="t-ui-md text-(--color-text-secondary)">{err?.message}</p>
        <Button variant="primary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    ),
  }
}
