import { formatStamp } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import type { OrderEventRow } from '@/lib/repos/orders'
import { STATUS_STYLE } from './status-badge'

/**
 * The order's history (order_events, append-only), oldest first, as an
 * ordered list: each step says what happened, who did it and when. Status
 * steps use the status's own glyph and word.
 */
export function OrderTimeline({ events }: { events: OrderEventRow[] }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-dashed border-line-strong pl-6">
      {events.map((event) => {
        const status = event.toStatus ? STATUS_STYLE[event.toStatus] : null
        const amount = typeof event.metadata.amount_kobo === 'number' ? event.metadata.amount_kobo : null
        const title =
          event.type === 'created'
            ? 'Order placed'
            : event.type === 'payment_received'
              ? `Payment received${amount !== null ? `: ${formatNaira(amount)}` : ''}`
              : event.type === 'note_added'
                ? 'Note'
                : `${status?.label ?? event.toStatus}`
        const glyph = event.type === 'created' ? '✎' : event.type === 'payment_received' ? '₦' : event.type === 'note_added' ? '✍' : (status?.glyph ?? '•')
        return (
          <li key={event.id} className="relative">
            <span aria-hidden className={`absolute top-0.5 -left-[2.1rem] grid size-6 place-items-center rounded-full border text-xs font-bold ${status ? status.className : 'border-line-strong bg-raised text-ink'}`}>
              {glyph}
            </span>
            <p className="font-bold">{title}</p>
            {event.note ? <p className="text-[0.95rem]">{event.note}</p> : null}
            <p className="text-sm text-muted">
              {event.actorLabel} · <time dateTime={event.createdAt.toISOString()}>{formatStamp(event.createdAt)}</time>
            </p>
          </li>
        )
      })}
    </ol>
  )
}
