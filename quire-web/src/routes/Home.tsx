import { useNavigate } from 'react-router-dom'
import { FileText, Rocket, Star } from 'lucide-react'
import { useContentStore } from '../store/contentStore'
import { followingFeed, userById } from '../data/mockData'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'

export function Home() {
  const navigate = useNavigate()
  const spaces = useContentStore((s) => s.spaces)
  const pages = useContentStore((s) => s.pages)
  const recentlyViewed = useContentStore((s) => s.recentlyViewed)
  const drafts = Object.values(pages).filter((p) => p.state === 'draft' && p.ownerId === 'u.daniel')
  const starred = Object.values(pages).filter((p) => p.starred)

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
          <Button variant="primary" onClick={() => navigate('/spaces')}>
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
                {recentlyViewed.map((r) => {
                  const page = pages[r.pageId]
                  const space = spaces.find((s) => s.id === r.spaceId)
                  if (!page) return null
                  return (
                    <button
                      key={r.pageId}
                      onClick={() => navigate(`/spaces/${r.spaceId}/pages/${r.pageId}`)}
                      className="flex items-center gap-3 px-4 h-12 text-left hover:bg-(--color-bg-hover)"
                    >
                      <FileText className="w-4 h-4 text-(--color-text-secondary) shrink-0" strokeWidth={1.5} />
                      <span className="t-ui-md truncate grow">{page.title}</span>
                      <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{space?.name}</span>
                      <span className="t-ui-sm text-(--color-text-secondary) shrink-0 w-24 text-right">{r.relativeTime}</span>
                    </button>
                  )
                })}
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
                      <span className="t-ui-sm text-(--color-text-secondary) shrink-0">{p.updatedRelative}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="t-content-h3 mb-3">Following feed</h2>
              <div className="flex flex-col gap-3">
                {followingFeed.map((f) => {
                  const page = pages[f.pageId]
                  const author = userById(f.authorId)
                  if (!page) return null
                  return (
                    <button
                      key={f.pageId}
                      onClick={() => navigate(`/spaces/${f.spaceId}/pages/${f.pageId}`)}
                      className="text-left p-4 rounded-(--radius-md) border border-(--color-border-default) bg-(--color-bg-canvas) hover:border-(--color-border-strong)"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Avatar user={author} size={16} />
                        <span className="t-ui-sm text-(--color-text-secondary)">
                          {author.name} updated <span className="t-ui-sm-medium text-(--color-text-primary)">{page.title}</span> &middot; {f.relativeTime}
                        </span>
                      </div>
                      <p className="t-ui-md text-(--color-text-secondary) line-clamp-2">{f.summary}</p>
                    </button>
                  )
                })}
              </div>
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
