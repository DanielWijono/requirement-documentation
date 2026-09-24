import { useNavigate } from 'react-router-dom'
import { FileText, Rocket, Star } from 'lucide-react'
import { relativeTime } from '@quire/shared'
import { useUIStore } from '../store/uiStore'
import { useMyDrafts, useRecentPages, useStarred } from '../queries/home'
import { useSearch } from '../queries/search'
import { PageSkeleton } from '../components/ui/Skeleton'
import { useUserLookup } from '../queries/users'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { useSpaceList } from '../queries/spaces'

export function Home() {
  const userById = useUserLookup()
  const navigate = useNavigate()
  const spaces = useSpaceList()
  const openCreatePage = useUIStore((s) => s.openCreatePage)
  const recent = useRecentPages()
  const draftsQuery = useMyDrafts()
  const starredQuery = useStarred()
  const updated = useSearch({ sort: 'modified', limit: 5 })
  const recentlyViewed = recent.data ?? []
  const drafts = draftsQuery.data ?? []
  const starred = starredQuery.data?.pages ?? []

  if (recent.isPending || draftsQuery.isPending) return <PageSkeleton />
  const isNewUser = recentlyViewed.length === 0 && drafts.length === 0

  if (isNewUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Rocket className="w-10 h-10 text-(--color-text-secondary)" strokeWidth={1.5} />
        <h1 className="t-content-h2">Start by joining a space or creating your first page</h1>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => navigate('/spaces')}>
            Browse spaces
          </Button>
          <Button variant="primary" onClick={openCreatePage}>
            Create page
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1120px] mx-auto px-6 py-8 grid gap-8" style={{ gridTemplateColumns: '1fr' }}>
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-8 min-w-0">
            <section>
              <h2 className="t-content-h3 mb-3">Recently viewed</h2>
              <div className="flex flex-col rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default) bg-(--color-bg-canvas)">
                {recentlyViewed.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/spaces/${r.spaceId}/pages/${r.id}`)}
                    className="flex items-center gap-3 px-4 h-12 text-left hover:bg-(--color-bg-hover)"
                  >
                    <FileText className="w-4 h-4 text-(--color-text-secondary) shrink-0" strokeWidth={1.5} />
                    <span className="t-ui-md truncate grow">{r.title}</span>
                    <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{r.spaceName}</span>
                    <span className="t-ui-sm text-(--color-text-secondary) shrink-0 w-24 text-right">{r.viewedAt ? relativeTime(r.viewedAt) : ''}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="t-content-h3 mb-3">Drafts</h2>
              {drafts.length === 0 ? (
                <p className="t-ui-md text-(--color-text-secondary)">No drafts right now.</p>
              ) : (
                <div className="flex flex-col rounded-(--radius-md) border border-(--color-border-default) divide-y divide-(--color-border-default) bg-(--color-bg-canvas)">
                  {drafts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}/edit`)}
                      className="flex items-center gap-3 px-4 h-12 text-left hover:bg-(--color-bg-hover)"
                    >
                      <FileText className="w-4 h-4 text-(--color-text-secondary) shrink-0" strokeWidth={1.5} />
                      <span className="t-ui-md italic text-(--color-text-secondary) truncate grow">{p.title}</span>
                      {p.hasDraft && <span className="t-ui-sm text-(--color-text-secondary) shrink-0">Unpublished changes</span>}
                      <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{relativeTime(p.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="t-content-h3 mb-3">Recently updated</h2>
              {updated.isPending ? (
                <p className="t-ui-md text-(--color-text-secondary)">Loading…</p>
              ) : (updated.data?.results.length ?? 0) === 0 ? (
                <p className="t-ui-md text-(--color-text-secondary)">Nothing has been published yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {updated.data!.results.map((p) => {
                    const author = userById(p.updatedById)
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}`)}
                        className="text-left p-4 rounded-(--radius-md) border border-(--color-border-default) bg-(--color-bg-canvas) hover:border-(--color-border-strong)"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar user={author} size={16} />
                          <span className="t-ui-sm text-(--color-text-secondary)">
                            {author.name} updated <span className="t-ui-sm-medium text-(--color-text-primary)">{p.title}</span> &middot; {relativeTime(p.updatedAt)}
                          </span>
                        </div>
                        <p className="t-ui-md text-(--color-text-secondary) line-clamp-2">{p.snippet.map((part) => part.text).join('')}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-8">
            <section>
              <h2 className="t-content-h3 mb-3 flex items-center gap-1.5">
                <Star className="w-4 h-4" strokeWidth={1.5} /> Starred
              </h2>
              {starred.length === 0 ? (
                <p className="t-ui-md text-(--color-text-secondary)">Nothing starred yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {starred.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/spaces/${p.spaceId}/pages/${p.id}`)}
                      className="t-ui-md text-left px-2 h-8 rounded-(--radius-sm) hover:bg-(--color-bg-hover) truncate"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="t-content-h3 mb-3">Your spaces</h2>
              <div className="flex flex-col gap-1">
                {spaces
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/spaces/${s.id}`)}
                      className="t-ui-md flex items-center gap-2 text-left px-2 h-9 rounded-(--radius-sm) hover:bg-(--color-bg-hover)"
                    >
                      <span>{s.icon}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
