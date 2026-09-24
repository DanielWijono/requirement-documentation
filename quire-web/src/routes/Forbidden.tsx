import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useUserLookup } from '../queries/users'
import { Button } from '../components/ui/Button'
import type { Page } from '../types'

/** 403: deliberately never shows the page title or content. */
export function Forbidden({ page, action = 'view' }: { page: Page; action?: 'view' | 'edit' }) {
  const userById = useUserLookup()
  const owner = userById(page.ownerId)
  const [requested, setRequested] = useState(false)
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <Lock className="w-10 h-10 text-(--color-text-secondary)" strokeWidth={1.5} />
      <h1 className="t-content-h2">You don’t have permission to {action} this page</h1>
      <p className="t-ui-md text-(--color-text-secondary) max-w-[420px]">Ask the owner, {owner.name}, for access.</p>
      <Button variant="primary" onClick={() => setRequested(true)} disabled={requested}>
        {requested ? 'Access requested' : 'Request access'}
      </Button>
    </div>
  )
}
