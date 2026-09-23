import clsx from 'clsx'
import type { WidthMode } from '../../types'

const WIDTH_CLASS: Record<WidthMode, string> = {
  reading: 'max-w-[760px]',
  wide: 'max-w-[960px]',
  full: 'max-w-none',
}

export function PageContent({ html, widthMode, archived = false }: { html: string; widthMode: WidthMode; archived?: boolean }) {
  return (
    <div className={clsx('mx-auto px-6 py-8', WIDTH_CLASS[widthMode])}>
      {/* Archived pages dim images only; text keeps full contrast (design.md §7). */}
      <div className={clsx('prose max-w-none', archived && '[&_img]:opacity-70')} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
