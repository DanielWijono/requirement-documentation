import { sessionKey } from '../src/hooks/useSession'
import { createQueryClient } from '../src/lib/queryClient'
import { fakeDb, SEED_ADMIN_ID } from './fakeApi/db'

/** A query client for tests: no retries, and (by default) the seeded admin's session already cached. */
export function testQueryClient({ signedIn = true }: { signedIn?: boolean } = {}) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
  if (signedIn) queryClient.setQueryData(sessionKey, fakeDb.userDto(SEED_ADMIN_ID))
  return queryClient
}
