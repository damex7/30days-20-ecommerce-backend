import type { OrderStatus } from '@/lib/repos/orders'
import { cn } from '@/lib/cn'

/**
 * An order's status: its own colour, its own glyph AND its word, so it
 * never relies on colour alone (see the palette notes in app/globals.css).
 */
export const STATUS_STYLE: Record<OrderStatus, { label: string; glyph: string; className: string }> = {
  pending_payment: { label: 'Awaiting payment', glyph: '◌', className: 'border-dashed border-ash bg-ash-soft text-ash' },
  paid: { label: 'Paid', glyph: '●', className: 'border-cobalt bg-cobalt-soft text-cobalt' },
  processing: { label: 'Processing', glyph: '◐', className: 'border-khaki bg-khaki-soft text-khaki' },
  shipped: { label: 'Shipped', glyph: '➜', className: 'border-charcoal bg-charcoal text-on-charcoal' },
  delivered: { label: 'Delivered', glyph: '✓', className: 'border-success bg-success-soft text-success' },
  cancelled: { label: 'Cancelled', glyph: '✕', className: 'border-danger bg-danger-soft text-danger' },
  refunded: { label: 'Refunded', glyph: '↺', className: 'border-danger bg-paper text-danger' },
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const style = STATUS_STYLE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-sm font-bold whitespace-nowrap', style.className, className)}>
      <span aria-hidden>{style.glyph}</span>
      {style.label}
    </span>
  )
}
