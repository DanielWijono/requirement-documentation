import clsx from 'clsx'

function Bar({ width, className }: { width: string; className?: string }) {
  // Pulses only when the user allows motion (design.md §10).
  return <span className={clsx('block rounded-(--radius-sm) bg-(--color-bg-sunken) motion-safe:animate-pulse', className)} style={{ width }} />
}

/** Mirrors the page layout: title, meta line, then paragraph bars at varied widths. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="flex-1 max-w-[760px] w-full mx-auto px-6 py-8 flex flex-col gap-3">
      <Bar width="60%" className="h-8 mb-1" />
      <Bar width="35%" className="h-3 mb-5" />
      {['100%', '96%', '88%', '92%', '60%'].map((w, i) => (
        <Bar key={i} width={w} className="h-4" />
      ))}
    </div>
  )
}
