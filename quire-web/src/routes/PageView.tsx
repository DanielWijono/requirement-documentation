import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePage } from '../store/contentStore'
import { useContentStore } from '../store/contentStore'
import { useUIStore } from '../store/uiStore'
import { PageHeader } from '../components/page/PageHeader'
import { PageContent } from '../components/page/PageContent'
import { RightPanel } from '../components/panel/RightPanel'
import { NotFound } from './NotFound'

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function PageView() {
  const { pageId, spaceId } = useParams()
  const navigate = useNavigate()
  const page = usePage(pageId)
  const recordView = useContentStore((s) => s.recordView)
  const togglePageStar = useContentStore((s) => s.togglePageStar)
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  useEffect(() => {
    if (page) recordView(page.id, page.spaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || !page) return
      if (e.key.toLowerCase() === 'e') navigate(`/spaces/${spaceId}/pages/${page.id}/edit`)
      else if (e.key.toLowerCase() === 'm') openRightPanel('comments')
      else if (e.key.toLowerCase() === 's') togglePageStar(page.id)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [page, spaceId, navigate, openRightPanel, togglePageStar])

  if (!page) return <NotFound />

  return (
    <div className="flex-1 flex min-w-0">
      <div id="page-scroll-region" className="flex-1 min-w-0 overflow-y-auto">
        <PageHeader page={page} />
        <PageContent html={page.contentHtml} widthMode={page.widthMode} />
      </div>
      <RightPanel page={page} />
    </div>
  )
}
