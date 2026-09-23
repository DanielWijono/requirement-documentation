import { LayoutTemplate } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useSpace } from '../store/contentStore'
import { NotFound } from './NotFound'

const TEMPLATES = [
  { name: 'Meeting notes', description: 'Agenda, attendees, and action items.' },
  { name: 'Product requirements', description: 'Problem, goals, scope, and success metrics.' },
  { name: 'Retrospective', description: "What went well, what didn't, action items." },
]

export function SpaceTemplates() {
  const { spaceId } = useParams()
  const space = useSpace(spaceId)
  if (!space) return <NotFound />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <h1 className="t-content-h1 mb-1 flex items-center gap-2">
          <LayoutTemplate className="w-6 h-6" strokeWidth={1.5} /> Templates
        </h1>
        <p className="t-ui-md text-(--color-text-secondary) mb-6">Blueprints available when creating a page in {space.name}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <div key={t.name} className="p-4 rounded-(--radius-md) border border-(--color-border-default) bg-(--color-bg-canvas)">
              <p className="t-ui-md-medium mb-1">{t.name}</p>
              <p className="t-ui-sm text-(--color-text-secondary)">{t.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
