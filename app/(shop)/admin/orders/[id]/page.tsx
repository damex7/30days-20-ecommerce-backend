import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { NoteForm, OrderMoves } from '@/components/admin/order-controls'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { OrderTimeline } from '@/components/shop/order-timeline'
import { StatusBadge } from '@/components/shop/status-badge'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { formatStamp } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { isServiceError } from '@/lib/services/errors'
import { getOrder, getOrderEvents, movesFor } from '@/lib/services/orders'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireShopActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Order' }

export default function AdminOrderPage({ params }: PageProps<'/admin/orders/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOrder params={params} />
    </Suspense>
  )
}

async function AdminOrder({ params }: Pick<PageProps<'/admin/orders/[id]'>, 'params'>) {
  const actor = await requireShopActor()
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id < 1) notFound()
  let order
  let events
  try {
    ;[order, events] = await Promise.all([getOrder(actor, id), getOrderEvents(actor, id)])
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const readOnly = isReadOnlyDemo(actor)
  const moves = movesFor(actor, order).map((m) => ({ to: m.to, label: m.label, destructive: m.to === 'refunded' || m.to === 'cancelled' }))

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/admin/orders', label: 'All orders' }}
        title={<span className="font-mono text-3xl sm:text-4xl">{order.number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} /> Placed {formatStamp(order.createdAt)}
            {order.isDemo ? <span className="stamp text-xs">Demo order</span> : null}
          </span>
        }
      />
      <ReadOnlyNote show={readOnly} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section aria-labelledby="move-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="move-title" className="mb-1 text-2xl">
              Next step
            </h2>
            <p className="mb-4 text-sm text-muted">Only the moves the order’s state allows are shown.</p>
            <OrderMoves orderId={order.id} version={order.version} moves={moves} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
          </section>
          <section aria-labelledby="items-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="items-title" className="text-2xl">
              Packing list
            </h2>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Items in this order (copied at purchase)</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2">Item</th>
                  <th scope="col" className="py-2">SKU</th>
                  <th scope="col" className="py-2 text-right">Qty</th>
                  <th scope="col" className="py-2 text-right">Line</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-line">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-2">
                      {item.productName}
                      <span className="block text-xs text-muted">{item.variantLabel}</span>
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">{item.sku}</td>
                    <td className="figures py-2 text-right">{item.quantity}</td>
                    <td className="figures py-2 text-right">{formatNaira(item.lineTotalKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="figures mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatNaira(order.subtotalKobo)}</dd>
              </div>
              {order.discountKobo > 0 ? (
                <div className="flex justify-between">
                  <dt>Discount ({order.couponCode})</dt>
                  <dd>−{formatNaira(order.discountKobo)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{formatNaira(order.deliveryFeeKobo)}</dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd>{formatNaira(order.totalKobo)}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="note-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="note-title" className="mb-3 text-2xl">
              Notes
            </h2>
            <NoteForm orderId={order.id} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
          </section>
        </div>
        <div className="space-y-6">
          <section aria-labelledby="customer-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
            <h2 id="customer-title" className="text-2xl">
              Customer
            </h2>
            <p className="mt-2">
              {order.customerName}
              <span className="block text-sm break-all text-muted">{order.customerEmail}</span>
            </p>
            <h3 className="mt-4 text-lg">Ship to</h3>
            <address className="not-italic">
              {order.shipRecipient}
              <br />
              {order.shipStreet}
              <br />
              {order.shipCity}, {order.shipState}
              {order.shipLandmark ? <span className="block text-sm text-muted">{order.shipLandmark}</span> : null}
              <span className="block text-sm">{order.shipPhone.startsWith('+') ? formatPhone(order.shipPhone) : order.shipPhone}</span>
            </address>
            <p className="mt-3 text-sm text-muted">
              Paystack reference <span className="font-mono break-all">{order.paystackReference}</span>
            </p>
            <Link href={`/admin/webhooks`} className="link mt-2 inline-block text-sm">
              Payment events
            </Link>
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
