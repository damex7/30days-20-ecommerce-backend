import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CouponForm, LineControls, RemoveCouponButton } from '@/components/shop/cart-controls'
import { Price } from '@/components/shop/price'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { getCart } from '@/lib/services/cart'
import { requirePageActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Your cart' }

export default function CartPage() {
  return (
    <>
      <PageHeader title="Your cart" description="Prices and stock are live: what you see here is what checkout will charge." />
      <Suspense fallback={<PageSkeleton />}>
        <Cart />
      </Suspense>
    </>
  )
}

async function Cart() {
  const actor = await requirePageActor()
  if (actor.user.role !== 'customer') {
    return (
      <Notice tone="info" title="Staff accounts don’t have a cart">
        <p>
          Sign in as a customer to shop, or open <Link href="/admin">the workshop</Link>.
        </p>
      </Notice>
    )
  }
  const cart = await getCart(actor)
  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty">
        <Link href="/products">Browse the workshop</Link> and add something you like.
      </EmptyState>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="lines-title">
        <h2 id="lines-title" className="sr-only">
          Items
        </h2>
        <ul className="divide-y divide-dashed divide-line rounded-card border border-line bg-raised shadow-card">
          {cart.lines.map((line) => (
            <li key={line.itemId} className="flex gap-4 p-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-control border border-line bg-sunken sm:size-24">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.imageUrl} alt="" width={96} height={80} className="size-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4">
                  <h3 className="text-lg leading-snug">
                    <Link href={`/products/${line.productSlug}`} className="text-ink">
                      {line.productName}
                    </Link>
                  </h3>
                  <p className="figures font-bold">{formatNaira(line.lineTotalKobo)}</p>
                </div>
                <p className="text-sm text-muted">
                  Size {line.size} · {line.colour} · <span className="font-mono">{line.sku}</span>
                </p>
                <p className="text-sm">
                  <Price kobo={line.priceKobo} compareAt={line.compareAtPriceKobo} /> each
                </p>
                {line.problem === 'unavailable' ? (
                  <p className="text-sm font-semibold text-danger">No longer available. Remove it to check out.</p>
                ) : line.problem === 'insufficient_stock' ? (
                  <p className="text-sm font-semibold text-danger">Only {line.available} left. Lower the quantity to check out.</p>
                ) : line.available <= 3 ? (
                  <p className="text-sm font-semibold text-khaki">Only {line.available} left</p>
                ) : null}
                <LineControls itemId={line.itemId} name={line.productName} quantity={line.quantity} max={line.available} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside aria-labelledby="summary-title" className="self-start rounded-card border border-line bg-raised p-5 shadow-card">
        <h2 id="summary-title" className="text-2xl">
          Summary
        </h2>
        <div className="mt-4">
          {cart.coupon ? (
            <div className={`rounded-control border p-3 ${cart.coupon.problem ? 'border-danger bg-danger-soft' : 'border-success bg-success-soft'}`}>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold">{cart.coupon.code}</span>
                <RemoveCouponButton code={cart.coupon.code} />
              </p>
              <p className={`mt-1 text-sm font-semibold ${cart.coupon.problem ? 'text-danger' : 'text-success'}`}>
                {cart.coupon.problem ?? `You save ${formatNaira(cart.coupon.discountKobo)}.`}
              </p>
            </div>
          ) : (
            <CouponForm />
          )}
        </div>
        <dl className="figures mt-5 space-y-2 border-t border-dashed border-line pt-4">
          <div className="flex justify-between gap-4">
            <dt>Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})</dt>
            <dd>{formatNaira(cart.subtotalKobo)}</dd>
          </div>
          {cart.discountKobo > 0 ? (
            <div className="flex justify-between gap-4 text-success">
              <dt>Discount</dt>
              <dd>−{formatNaira(cart.discountKobo)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 text-muted">
            <dt>Delivery</dt>
            <dd>At checkout</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-lg font-bold">
            <dt>Total so far</dt>
            <dd>{formatNaira(cart.totalKobo)}</dd>
          </div>
        </dl>
        {cart.ready ? (
          <Link href="/checkout" className={`${button.large} mt-5 w-full`}>
            Checkout
            <Icon name="arrowRight" />
          </Link>
        ) : (
          <p className="mt-5 rounded-control border border-dashed border-line-strong p-3 text-sm text-muted">
            Fix the items marked in red{cart.coupon?.problem ? ' and remove the code' : ''} to check out.
          </p>
        )}
      </aside>
    </div>
  )
}
