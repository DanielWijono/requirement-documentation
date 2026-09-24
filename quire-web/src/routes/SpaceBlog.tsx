import { SquarePen } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Button } from '../components/ui/Button'
import { useSpaceRoute } from '../components/space/useSpaceRoute'

export function SpaceBlog() {
  const { spaceId } = useParams()
  const { space, fallback } = useSpaceRoute(spaceId)
  if (!space) return fallback

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <SquarePen className="w-8 h-8 text-(--color-text-secondary)" strokeWidth={1.5} />
      <h1 className="t-content-h3">No posts yet in {space.name}</h1>
      <p className="t-ui-md text-(--color-text-secondary) max-w-[380px]">
        Blog posts are dated updates for this space, separate from the page tree.
      </p>
      <Button variant="primary">Write a post</Button>
    </div>
  )
}
