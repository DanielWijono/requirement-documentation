import { sessionKey } from '../src/hooks/useSession'
import { createQueryClient } from '../src/lib/queryClient'
import { pageKeys } from '../src/queries/pages'
import { spacesKey } from '../src/queries/spaces'
import { usersKey } from '../src/queries/users'
import { fakeDb, SEED_ADMIN_ID } from './fakeApi/db'
import { canSeePage, pageDto, treeNodes } from './fakeApi/pages'
import { spaceDto, visibleSpace } from './fakeApi/spaces'

/**
 * A query client for tests: no retries and, when signed in, the session, people and spaces already
 * cached from the fake, the way a page load would have them. Everything else loads through the fake API.
 */
export function testQueryClient({ signedIn = true, prefetch = true, path = '/' }: { signedIn?: boolean; prefetch?: boolean; path?: string } = {}) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
  if (signedIn) queryClient.setQueryData(sessionKey, fakeDb.userDto(SEED_ADMIN_ID))
  if (signedIn && prefetch) {
    queryClient.setQueryData(
      usersKey,
      fakeDb.activeUserIds().map((id) => fakeDb.userDto(id)),
    )
    queryClient.setQueryData(
      spacesKey,
      [...fakeDb.spaces.values()].filter((s) => visibleSpace(s.id, SEED_ADMIN_ID)).map((s) => spaceDto(s, SEED_ADMIN_ID)),
    )
    // The route's space tree and page, as the server would send them with the first paint.
    const spaceId = /^\/spaces\/([^/?]+)/.exec(path)?.[1]
    const pageId = /\/pages\/([^/?]+)/.exec(path)?.[1]
    if (spaceId && visibleSpace(spaceId, SEED_ADMIN_ID)) queryClient.setQueryData(pageKeys.tree(spaceId), treeNodes(spaceId, SEED_ADMIN_ID))
    const page = pageId ? fakeDb.pages.get(pageId) : undefined
    if (page && canSeePage(page, SEED_ADMIN_ID)) queryClient.setQueryData(pageKeys.page(page.id), pageDto(page, SEED_ADMIN_ID))
  }
  return queryClient
}
