import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronRight, MoreHorizontal, Share2, Star } from 'lucide-react'
import type { Page } from '../../types'
import { useUserLookup } from '../../queries/users'
import { useTogglePageStar } from '../../queries/pages'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { Lozenge, RestrictedLozenge } from '../ui/Lozenge'
import { PageStateBanner } from './PageStateBanner'
import { ShareModal } from './ShareModal'
import { usePageActions } from './usePageActions'
import { useUIStore } from '../../store/uiStore'
import { useSpace } from '../../queries/spaces'

export function PageHeader({
  page,
  viewingDraft = false,
  onToggleDraftView = () => {},
}: {
  page: Page
  viewingDraft?: boolean
  onToggleDraftView?: () => void
}) {
  const userById = useUserLookup()
  const navigate = useNavigate()
  const { spaceId } = useParams()
  const space = useSpace(page.spaceId)
  const togglePageStar = useTogglePageStar()
  const pushToast = useUIStore((s) => s.pushToast)
  const [shareOpen, setShareOpen] = useState(false)
  const [condensed, setCondensed] = useState(false)

  const chain = page.ancestors ?? []
  const author = userById(page.updatedById)

  useEffect(() => {
    const el = document.getElementById('page-scroll-region')
    if (!el) return
    function onScroll() {
      setCondensed((el as HTMLElement).scrollTop > 160)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div
        className={clsx(
          'sticky top-0 z-(--z-sticky) bg-(--color-bg-canvas) transition-shadow',
          condensed && 'shadow-[var(--elevation-1)] border-b border-(--color-border-default)',
        )}
      >
        {condensed ? (
          <div className="h-10 flex items-center gap-2 px-6">
            <span className="t-ui-sm text-(--color-text-secondary) truncate">
              {space?.name} / {chain.length > 1 ? '… / ' : ''}
              {chain.at(-1)?.title}
            </span>
            <span className="t-ui-md-medium truncate">{page.title}</span>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <HeaderActions page={page} onShare={() => setShareOpen(true)} />
            </div>
          </div>
        ) : (
          <div className="px-6 pt-6 pb-4 flex flex-col gap-2">
            <div className="flex items-center gap-1 t-ui-sm text-(--color-text-secondary) flex-wrap">
              <button onClick={() => navigate(`/spaces/${spaceId}`)} className="hover:text-(--color-text-primary) hover:underline">
                {space?.name}
              </button>
              {chain.map((n) => (
                <span key={n.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  <button onClick={() => navigate(`/spaces/${spaceId}/pages/${n.id}`)} className="hover:text-(--color-text-primary) hover:underline">
                    {n.title}
                  </button>
                </span>
              ))}
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <HeaderActions page={page} onShare={() => setShareOpen(true)} />
              </span>
            </div>

            {page.icon && <span className="text-4xl leading-none">{page.icon}</span>}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="t-content-title">{page.title}</h1>
              {page.state === 'draft' && <Lozenge>Draft</Lozenge>}
            </div>

            <div className="flex items-center gap-2 t-ui-sm text-(--color-text-secondary) flex-wrap">
              <Avatar user={userById(page.ownerId)} size={16} />
              <span>
                Owned by {userById(page.ownerId).name} · Last updated {page.updatedRelative} by {author.name} · {page.readTime}
              </span>
              {page.restricted && <RestrictedLozenge />}
              <button
                onClick={() => {
                  togglePageStar.mutate({ page, on: !page.starred })
                  pushToast({ message: page.starred ? 'Removed from starred' : 'Starred', tone: 'success' })
                }}
                className="ml-1 text-(--color-text-secondary) hover:text-(--color-text-primary)"
                aria-label={page.starred ? 'Unstar' : 'Star'}
                title="Star (S)"
              >
                <Star className="w-4 h-4" strokeWidth={1.5} fill={page.starred ? 'currentColor' : 'none'} />
              </button>
            </div>

            {page.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {page.labels.map((l) => (
                  <span key={l.name} className="t-ui-sm px-1.5 h-5 inline-flex items-center rounded-(--radius-sm) bg-(--color-bg-sunken)">
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            <PageStateBanner page={page} viewingDraft={viewingDraft} onToggleDraftView={onToggleDraftView} />
          </div>
        )}
      </div>
      <ShareModal page={page} open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  )
}

function HeaderActions({ page, onShare }: { page: Page; onShare: () => void }) {
  const navigate = useNavigate()
  const { spaceId } = useParams()
  const togglePageStar = useTogglePageStar()
  const actions = usePageActions(page)

  return (
    <>
      {page.access?.edit && (
        <Button variant="primary" size="compact" onClick={() => navigate(`/spaces/${spaceId}/pages/${page.id}/edit`)}>
          Edit
        </Button>
      )}
      <Button
        variant="subtle"
        iconOnly
        icon={<Star strokeWidth={1.5} fill={page.starred ? 'currentColor' : 'none'} />}
        onClick={() => togglePageStar.mutate({ page, on: !page.starred })}
        aria-label="Star"
      />
      <Button variant="subtle" iconOnly icon={<Share2 strokeWidth={1.5} />} onClick={onShare} aria-label="Share" />
      <Menu
        align="end"
        trigger={<Button variant="subtle" iconOnly icon={<MoreHorizontal strokeWidth={1.5} />} aria-label="More actions" />}
        items={[
          ...actions.items.slice(0, 3),
          { label: '', divider: true },
          { label: 'View in templates', onSelect: () => navigate(`/spaces/${spaceId}/templates`) },
          ...actions.items.slice(3),
        ]}
      />
      {actions.dialogs}
    </>
  )
}
