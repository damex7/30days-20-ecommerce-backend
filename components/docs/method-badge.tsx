import { cn } from '@/lib/cn'

/** HTTP methods: each its own colour, always with the word itself (never colour alone). */
const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-success text-on-success',
  POST: 'bg-cobalt text-on-cobalt',
  PUT: 'bg-charcoal text-on-charcoal',
  PATCH: 'bg-khaki text-on-khaki',
  DELETE: 'bg-danger text-on-danger',
}

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  return (
    <span className={cn('inline-block min-w-[4.25rem] rounded-control px-2 py-0.5 text-center font-mono text-xs font-bold tracking-wide', METHOD_STYLE[method] ?? 'bg-sunken text-ink', className)}>
      {method}
    </span>
  )
}
