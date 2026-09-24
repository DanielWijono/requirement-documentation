import { useState } from 'react'
import clsx from 'clsx'
import type { Page } from '../../types'
import { useUserLookup } from '../../queries/users'
import { Avatar } from '../ui/Avatar'
import { Lozenge } from '../ui/Lozenge'
import { VersionCompareModal } from './VersionCompareModal'
import { useVersions } from '../../queries/pages'

export function HistoryTab({ page }: { page: Page }) {
  const userById = useUserLookup()
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  const versions = useVersions({ id: page.id, publishedVersion: page.publishedVersion })

  if (versions.isPending) return <p className="t-ui-md text-(--color-text-secondary) text-center mt-8 px-4">Loading history…</p>
  if (versions.isError) {
    return (
      <p role="alert" className="t-ui-md text-(--status-danger-text) text-center mt-8 px-4">
        Couldn’t load history.{' '}
        <button className="underline" onClick={() => void versions.refetch()}>
          Try again
        </button>
      </p>
    )
  }
  if (versions.data.length === 0) {
    return <p className="t-ui-md text-(--color-text-secondary) text-center mt-8 px-4">No published versions yet.</p>
  }

  return (
    <div className="overflow-y-auto h-full">
      {versions.data.map((v) => {
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

      <VersionCompareModal page={page} versions={versions.data} version={compareVersion} onClose={() => setCompareVersion(null)} />
    </div>
  )
}
