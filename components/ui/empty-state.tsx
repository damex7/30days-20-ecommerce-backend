import type { ReactNode } from 'react'
import { Mark } from '@/components/brand/mark'

/** A calm, centred message for empty lists, with the hide mark. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center bg-raised rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
      <Mark className="mb-4 size-14 text-brand" />
      <h2 className="text-xl">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-muted [&_a]:font-semibold [&_a]:text-ink [&_a]:underline">{children}</div> : null}
    </div>
  )
}
