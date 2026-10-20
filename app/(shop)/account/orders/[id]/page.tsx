import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ActionButton } from '@/components/forms/action-button'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { OrderTimeline } from '@/components/shop/order-timeline'
import { StatusBadge } from '@/components/shop/status-badge'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatStamp, fromNow } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { isServiceError } from '@/lib/services/errors'
import { getOrder, getOrderEvents, movesFor } from '@/lib/services/orders'
import { requirePageActor } from '@/lib/services/session-actor'
import { cancelOrder, payOrder } from '../../orders-actions'

export const metadata: Metadata = { title: 'Order', robots: { index: false } }

export default function OrderPage({ params, searchParams }: PageProps<'/account/orders/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Order params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Order({ params, searchParams }: Pick<PageProps<'/account/orders/[id]'>, 'params' | 'searchParams'>) {
  const actor = await requirePageActor()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const orderId = Number(id)
  if (!Number.isSafeInteger(orderId) || orderId < 1) notFound()

  let order
  let events
  try {
    // Owner-scoped in the SQL: someone else's order is "not found" here too
    // (proxy.ts already answered those with a real 404 status).
    ;[order, events] = await Promise.all([getOrder(actor, orderId), getOrderEvents(actor, orderId)])
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const moves = movesFor(actor, order)
  const canCancel = moves.some((m) => m.to === 'cancelled')
  const pending = order.status === 'pending_payment'

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: actor.user.role === 'customer' ? '/account' : `/admin/orders/${order.id}`, label: 'Your orders' }}
        title={<span className="font-mono text-3xl sm:text-4xl">{order.number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} /> Placed {formatStamp(order.createdAt)}
          </span>
        }
      />

      {query.notice === 'pay-later' ? (
        <Notice tone="warning" title="Your order is saved, but we couldn’t reach Paystack">
          <p>Your items are held for 30 minutes. Try paying again below in a moment.</p>
        </Notice>
      ) : null}
      {query.notice === 'cancelled' ? (
        <Notice tone="success" title="Order cancelled" live>
          <p>The items went back on the shelf. Nothing was charged.</p>
        </Notice>
      ) : null}

      {pending && order.expiresAt ? (
        <div className="rounded-card border-2 border-dashed border-ash bg-ash-soft p-5">
          <p className="font-bold text-ash">Awaiting payment: your items are held until {formatStamp(order.expiresAt)} ({fromNow(order.expiresAt)}).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton action={payOrder} fields={{ id: String(order.id) }} variant="primary" pendingLabel="Opening Paystack…">
              Pay {formatNaira(order.totalKobo)} with Paystack
            </ActionButton>
            {canCancel ? (
              <ConfirmAction
                action={cancelOrder}
                fields={{ id: String(order.id), version: String(order.version) }}
                trigger="Cancel order"
                triggerVariant="secondary"
                title="Cancel this order?"
                body={<p>The items go back on the shelf and any coupon can be used again. Nothing has been charged.</p>}
                confirmLabel="Cancel order"
                danger
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="items-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
          <h2 id="items-title" className="text-2xl">
            Items
          </h2>
          {/* Names and prices were COPIED into the order when it was placed. */}
          <ul className="mt-3 divide-y divide-dashed divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-3">
                <div>
                  <Link href={`/products/${item.productSlug}`} className="font-semibold text-ink">
                    {item.productName}
                  </Link>
                  <p className="text-sm text-muted">
                    {item.variantLabel} · <span className="font-mono">{item.sku}</span> · {item.quantity} × <span className="figures">{formatNaira(item.unitPriceKobo)}</span>
                  </p>
                </div>
                <span className="figures font-bold">{formatNaira(item.lineTotalKobo)}</span>
              </li>
            ))}
          </ul>
          <dl className="figures mt-3 space-y-1.5 border-t border-line pt-3">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatNaira(order.subtotalKobo)}</dd>
            </div>
            {order.discountKobo > 0 ? (
              <div className="flex justify-between text-success">
                <dt>
                  Discount <span className="font-mono">{order.couponCode}</span>
                </dt>
                <dd>−{formatNaira(order.discountKobo)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Delivery to {order.shipState}</dt>
              <dd>{formatNaira(order.deliveryFeeKobo)}</dd>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd>{formatNaira(order.totalKobo)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="ship-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="ship-title" className="text-2xl">
              Delivering to
            </h2>
            <address className="mt-2 not-italic">
              {order.shipRecipient}
              <br />
              {order.shipStreet}
              <br />
              {order.shipCity}, {order.shipState}
              {order.shipLandmark ? <span className="block text-sm text-muted">{order.shipLandmark}</span> : null}
              <span className="block text-sm">{order.shipPhone.startsWith('+') ? formatPhone(order.shipPhone) : order.shipPhone}</span>
            </address>
            <p className="mt-2 text-sm text-muted">
              {order.deliveryMinDays}–{order.deliveryMaxDays} working days after it ships.
            </p>
          </section>
          <section aria-labelledby="timeline-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="timeline-title" className="mb-4 text-2xl">
              History
            </h2>
            <OrderTimeline events={events} />
          </section>
        </div>
      </div>
    </div>
  )
}
