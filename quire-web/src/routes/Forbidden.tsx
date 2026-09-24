import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

/**
 * 403: deliberately never shows the page title or content. The API doesn't say who owns a page you
 * can't see, so the owner is only named when you can view the page but not edit it.
 */
export function Forbidden({ action = 'view', ownerName }: { action?: 'view' | 'edit'; ownerName?: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <Lock className="w-10 h-10 text-(--color-text-secondary)" strokeWidth={1.5} />
      <h1 className="t-content-h2">You don’t have permission to {action} this page</h1>
      <p className="t-ui-md text-(--color-text-secondary) max-w-[420px]">
        {ownerName ? `Ask the owner, ${ownerName}, or a space admin for access.` : 'Ask whoever shared it with you, or a space admin, for access.'}
      </p>
      <Button variant="default" onClick={() => navigate(-1)}>
        Go back
      </Button>
    </div>
  )
}
