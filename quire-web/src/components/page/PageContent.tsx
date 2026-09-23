import clsx from 'clsx'
import type { WidthMode } from '../../types'

const WIDTH_CLASS: Record<WidthMode, string> = {
  reading: 'max-w-[760px]',
  wide: 'max-w-[960px]',
  full: 'max-w-none',
}

export function PageContent({ html, widthMode }: { html: string; widthMode: WidthMode }) {
  return (
    <div className={clsx('mx-auto px-6 py-8', WIDTH_CLASS[widthMode])}>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
