import { useState } from 'react'
import clsx from 'clsx'
import type { Page } from '../../types'
import { userById } from '../../data/mockData'
import { Avatar } from '../ui/Avatar'
import { Lozenge } from '../ui/Lozenge'
import { VersionCompareModal } from './VersionCompareModal'

export function HistoryTab({ page }: { page: Page }) {
  const [compareVersion, setCompareVersion] = useState<number | null>(null)

  if (page.versions.length === 0) {
    return <p className="t-ui-md text-(--color-text-secondary) text-center mt-8 px-4">No published versions yet.</p>
  }

  return (
    <div className="overflow-y-auto h-full">
      {page.versions.map((v) => {
        const author = userById(v.authorId)
        return (
          <button
            key={v.version}
            onClick={() => setCompareVersion(v.version)}
            className={clsx('w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-(--color-bg-hover) border-b border-(--color-border-default)')}
          >
            <Avatar user={author} size={24} />
            <div className="min-w-0 grow">
              <div className="flex items-center gap-1.5">
                <span className="t-ui-md-medium">Version {v.version}</span>
                {v.current && <Lozenge status="info">Current</Lozenge>}
              </div>
              <p className="t-ui-sm text-(--color-text-secondary)">
                {author.name} · {v.relativeTime}
              </p>
              <p className="t-ui-md mt-0.5">{v.comment}</p>
            </div>
          </button>
        )
      })}

      <VersionCompareModal
        page={page}
        version={compareVersion}
        onClose={() => setCompareVersion(null)}
      />
    </div>
  )
}
