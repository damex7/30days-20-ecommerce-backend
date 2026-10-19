// WHERE PAYSTACK SENDS THE CUSTOMER BACK: /checkout/callback?reference=…
//
// The query string proves nothing (anyone can type ?reference=…), so this
// page asks Paystack's VERIFY endpoint, server to server, what really
// happened, and applies it through the same idempotent applyCharge() the
// webhook uses. Refreshing the page is harmless: the second verify finds
// the order already paid. Locally (no webhooks reach localhost) this is
// what marks orders paid.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { StatusBadge } from '@/components/shop/status-badge'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { formatNaira } from '@/lib/money'
import { isServiceError } from '@/lib/services/errors'
import { confirmFromCallback } from '@/lib/services/payments'
import { requirePageActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Payment', robots: { index: false } }

export default function CallbackPage({ searchParams }: PageProps<'/checkout/callback'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Result searchParams={searchParams} />
    </Suspense>
  )
}

async function Result({ searchParams }: Pick<PageProps<'/checkout/callback'>, 'searchParams'>) {
  const actor = await requirePageActor()
  const params = await searchParams
  const reference = (Array.isArray(params.reference) ? params.reference[0] : params.reference) ?? ''
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(reference)) {
    return (
      <Notice tone="danger" title="We couldn’t tell which payment this was">
        <p>
          The link is incomplete. Your orders are on <Link href="/account">your account page</Link>.
        </p>
      </Notice>
    )
  }

  let order
  try {
    order = await confirmFromCallback(actor, reference)
  } catch (error) {
    if (isServiceError(error) && (error.kind === 'not_found' || error.kind === 'unavailable')) {
      return (
        <Notice tone="warning" title={error.kind === 'not_found' ? 'We couldn’t find that order' : 'We couldn’t confirm your payment just yet'}>
          <p>
            {error.message} If money left your account, the order will be marked paid as soon as Paystack tells us (usually within a minute). Check{' '}
            <Link href="/account">your orders</Link>.
          </p>
        </Notice>
      )
    }
    throw error
  }

  const paid = order.paidAt !== null
  return (
    <div className="mx-auto max-w-2xl">
      <div className="stitched rounded-card border border-line bg-raised p-6 text-center shadow-card sm:p-10">
        <span className={`mx-auto mb-4 grid size-16 place-items-center rounded-full ${paid ? 'bg-success-soft text-success' : 'bg-khaki-soft text-khaki'}`}>
          <Icon name={paid ? 'checkCircle' : 'clock'} className="size-8" />
        </span>
        <h1 className="text-4xl">{paid ? 'Thank you! Your order is paid.' : 'Your payment isn’t complete'}</h1>
        <p className="mt-3 text-muted">
          Order <span className="font-mono font-bold text-ink">{order.number}</span> · {formatNaira(order.totalKobo)}
        </p>
        <p className="mt-3">
          <StatusBadge status={order.status} />
        </p>
        <p className="mt-4">
          {paid
            ? `A receipt is on its way to ${order.customerEmail}. It will reach ${order.shipCity} in ${order.deliveryMinDays}–${order.deliveryMaxDays} working days.`
            : order.status === 'pending_payment'
              ? 'Paystack didn’t confirm the payment. Your items are still held until the 30 minutes are up, so you can try again.'
              : 'This order was cancelled because it wasn’t paid in time.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={`/account/orders/${order.id}`} className={button.primary}>
            {order.status === 'pending_payment' ? 'Try paying again' : 'Track this order'}
          </Link>
          <Link href="/products" className={button.secondary}>
            Keep shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
