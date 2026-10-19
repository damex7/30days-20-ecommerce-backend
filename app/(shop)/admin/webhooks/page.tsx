import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { formatStamp } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { isServiceError } from '@/lib/services/errors'
import { listPaymentEvents } from '@/lib/services/payments'
import { requireAdminActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Webhook log' }

/** Each outcome: its own colour AND word (and a glyph). */
const OUTCOME_STYLE: Record<string, { label: string; glyph: string; className: string }> = {
  paid: { label: 'Marked paid', glyph: '✓', className: 'border-success bg-success-soft text-success' },
  already_paid: { label: 'Already paid', glyph: '=', className: 'border-ash bg-ash-soft text-ash' },
  ignored: { label: 'Ignored', glyph: '–', className: 'border-ash bg-ash-soft text-ash' },
  amount_mismatch: { label: 'Amount mismatch: refused', glyph: '!', className: 'border-danger bg-danger-soft text-danger' },
  unknown_order: { label: 'Unknown order', glyph: '?', className: 'border-khaki bg-khaki-soft text-khaki' },
  needs_refund: { label: 'Needs a refund', glyph: '↺', className: 'border-danger bg-paper text-danger' },
  failed: { label: 'Charge failed', glyph: '✕', className: 'border-danger bg-danger-soft text-danger' },
}

export default function WebhooksPage({ searchParams }: PageProps<'/admin/webhooks'>) {
  return (
    <>
      <PageHeader
        title="Webhook log"
        description="Every Paystack event we received (and every callback verify), newest first, with what we did about it. Each event id is processed once, however often Paystack sends it."
      />
      <Suspense fallback={<TableSkeleton />}>
        <Log searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Log({ searchParams }: Pick<PageProps<'/admin/webhooks'>, 'searchParams'>) {
  const actor = await requireAdminActor()
  const params = await searchParams
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined
  let page
  try {
    page = await listPaymentEvents(actor, { cursor, limit: 30 })
  } catch (error) {
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    page = await listPaymentEvents(actor, { limit: 30 })
  }
  if (page.items.length === 0) return <EmptyState title="No payment events yet">They appear here as Paystack calls the webhook or customers return from paying.</EmptyState>

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-dashed divide-line rounded-card border border-line bg-raised shadow-card">
        {page.items.map((e) => {
          const style = e.outcome ? OUTCOME_STYLE[e.outcome] : { label: 'Processing…', glyph: '◌', className: 'border-ash bg-ash-soft text-ash' }
          return (
            <li key={e.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{e.eventType}</span>
                  <span className="stamp text-[0.6rem] text-muted">{e.source}</span>
                </p>
                <p className="font-mono text-xs break-all text-muted">{e.eventId}</p>
                <p className="mt-1 text-sm">
                  {e.orderId ? (
                    <Link href={`/admin/orders/${e.orderId}`} className="font-mono font-semibold">
                      {e.orderNumber ?? `Order ${e.orderId}`}
                    </Link>
                  ) : (
                    <span className="text-muted">No order</span>
                  )}
                  {e.amountKobo !== null ? <span className="figures"> · {formatNaira(e.amountKobo)}</span> : null}
                  {e.currency && e.currency !== 'NGN' ? ` ${e.currency}` : ''} · <time dateTime={e.receivedAt.toISOString()}>{formatStamp(e.receivedAt)}</time>
                </p>
                {e.detail ? <p className="mt-1 text-sm text-muted">{e.detail}</p> : null}
              </div>
              <span className={`self-start rounded-pill border px-2.5 py-0.5 text-sm font-bold whitespace-nowrap ${style?.className ?? ''}`}>
                <span aria-hidden>{style?.glyph}</span> {style?.label}
              </span>
            </li>
          )
        })}
      </ul>
      <nav aria-label="Pages" className="flex gap-2">
        {cursor ? (
          <Link href="/admin/webhooks" className={button.secondary}>
            Back to the newest
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={`/admin/webhooks?cursor=${encodeURIComponent(page.nextCursor)}`} className={button.primary}>
            Older events
          </Link>
        ) : null}
      </nav>
    </div>
  )
}
