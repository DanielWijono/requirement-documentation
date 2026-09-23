import { FileQuestion } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <FileQuestion className="w-10 h-10 text-(--color-text-secondary)" strokeWidth={1.5} />
      <h1 className="t-content-h2">Page not found</h1>
      <p className="t-ui-md text-(--color-text-secondary) max-w-[420px]">
        This page was deleted, moved, or never existed. A space admin can restore it from Trash if it was deleted.
      </p>
      <Button variant="primary" onClick={() => navigate('/')}>
        Go home
      </Button>
    </div>
  )
}
