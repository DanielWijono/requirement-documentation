import type { ReactNode } from 'react'
import { useSpace, useSpaces } from '../../queries/spaces'
import { NotFound } from '../../routes/NotFound'
import type { Space } from '../../types'
import { Button } from '../ui/Button'
import { PageSkeleton } from '../ui/Skeleton'

/**
 * The space a route is about, or what to show instead: a skeleton while spaces load, an error with a
 * retry, or Not found once the list is in and the space isn't in it.
 */
export function useSpaceRoute(spaceId: string | undefined): { space: Space; fallback: null } | { space: undefined; fallback: ReactNode } {
  const query = useSpaces()
  const space = useSpace(spaceId)
  if (space) return { space, fallback: null }
  if (query.isPending) return { space: undefined, fallback: <PageSkeleton /> }
  if (query.isError) {
    return {
      space: undefined,
      fallback: (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <h1 className="t-content-h2">Couldn’t load this space</h1>
          <p className="t-ui-md text-(--color-text-secondary)">{query.error.message}</p>
          <Button variant="primary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ),
    }
  }
  return { space: undefined, fallback: <NotFound /> }
}
