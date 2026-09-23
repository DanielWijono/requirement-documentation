import type { ReactNode } from 'react'
import { Paperclip, Tag } from 'lucide-react'
import type { Page } from '../../types'
import { userById } from '../../data/mockData'
import { Avatar } from '../ui/Avatar'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2.5 border-b border-(--color-border-default) last:border-0">
      <p className="t-ui-sm text-(--color-text-secondary) mb-1">{label}</p>
      <div className="t-ui-md">{children}</div>
    </div>
  )
}

export function DetailsTab({ page }: { page: Page }) {
  const owner = userById(page.ownerId)
  const created = page.versions[page.versions.length - 1]

  return (
    <div className="px-4 py-2 overflow-y-auto h-full">
      <Row label="Owner">
        <div className="flex items-center gap-2">
          <Avatar user={owner} size={24} />
          {owner.name}
        </div>
      </Row>
      <Row label="Created">{created ? `${created.relativeTime}` : 'Just now'}</Row>
      <Row label="Word count">{page.wordCount.toLocaleString()} words · {page.readTime}</Row>
      <Row label="Labels">
        {page.labels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {page.labels.map((l) => (
              <span key={l.name} className="t-ui-sm inline-flex items-center gap-1 px-1.5 h-5 rounded-(--radius-sm) bg-(--color-bg-sunken)">
                <Tag className="w-3 h-3" strokeWidth={1.5} />
                {l.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-(--color-text-secondary)">No labels</span>
        )}
      </Row>
      <Row label="Attachments">
        <div className="flex items-center gap-2 text-(--color-text-secondary)">
          <Paperclip className="w-4 h-4" strokeWidth={1.5} />
          None yet
        </div>
      </Row>
      <Row label="Analytics">
        <span className="text-(--color-text-secondary)">128 views · 6 viewers this week</span>
      </Row>
    </div>
  )
}
