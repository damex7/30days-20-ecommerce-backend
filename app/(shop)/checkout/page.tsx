import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AddressForm } from '@/components/shop/address-form'
import { PlaceOrderForm } from '@/components/shop/place-order-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { TEST_CARD } from '@/lib/paystack'
import { listAddresses } from '@/lib/services/addresses'
import { getCart } from '@/lib/services/cart'
import { requirePageActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Checkout' }

export default function CheckoutPage({ searchParams }: PageProps<'/checkout'>) {
  return (
    <>
      <PageHeader title="Checkout" back={{ href: '/cart', label: 'Back to cart' }} />
      <Suspense fallback={<PageSkeleton />}>
        <Checkout searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Checkout({ searchParams }: Pick<PageProps<'/checkout'>, 'searchParams'>) {
  const actor = await requirePageActor()
  if (actor.user.role !== 'customer') redirect('/cart')
  const params = await searchParams
  const addresses = await listAddresses(actor)
  const asked = Number(Array.isArray(params.address) ? params.address[0] : params.address)
  const chosen = addresses.find((a) => a.id === asked) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null
  const cart = await getCart(actor, { addressId: chosen?.id })
  if (cart.lines.length === 0) redirect('/cart')

  const reason = !chosen ? 'Add a delivery address first.' : !cart.ready ? 'Something in your cart needs attention: go back to the cart.' : null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        <section aria-labelledby="address-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
          <h2 id="address-title" className="text-2xl">
            1. Where should it go?
          </h2>
          {addresses.length > 0 ? (
            // A GET form: choosing an address reloads the page with that
            // address's delivery fee. Works without JavaScript.
            <form method="get" action="/checkout" className="mt-4">
              <fieldset>
                <legend className="sr-only">Delivery address</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <label key={a.id} className="flex cursor-pointer gap-3 rounded-control border border-line-strong bg-paper p-3 has-checked:border-2 has-checked:border-brand has-checked:bg-tint has-focus-visible:outline-3 has-focus-visible:outline-focus">
                      <input type="radio" name="address" value={a.id} defaultChecked={a.id === chosen?.id} className="mt-1 size-4 accent-brand" />
                      <span className="text-sm">
                        <span className="block font-bold">
                          {a.label ?? a.recipientName}
                          {a.isDefault ? <span className="stamp ml-2 text-[0.6rem] text-muted">Default</span> : null}
                        </span>
                        {a.recipientName} · {formatPhone(a.phone)}
                        <br />
                        {a.street}, {a.city}, {a.state}
                        {a.landmark ? <span className="block text-muted">{a.landmark}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className={`${button.secondary} mt-3`}>
                Deliver here
              </button>
            </form>
          ) : (
            <p className="mt-2 text-muted">You have no saved addresses yet.</p>
          )}
          <details className="mt-4 rounded-control border border-dashed border-line-strong p-3" open={addresses.length === 0}>
            <summary className="min-h-9 cursor-pointer content-center font-semibold">Add a new address</summary>
            <div className="mt-3">
              <AddressForm after="checkout" submitLabel="Save and deliver here" />
            </div>
          </details>
        </section>

        <section aria-labelledby="pay-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
          <h2 id="pay-title" className="text-2xl">
            2. Pay with Paystack
          </h2>
          <p className="mt-2 text-muted">
            You’ll go to Paystack’s secure page to pay by card, transfer or USSD. We never see your card details. Your items are held for 30 minutes while
            you pay.
          </p>
          <Notice tone="info" title="Test mode: no real money" className="mt-4">
            <p className="figures font-mono text-sm">
              Card {TEST_CARD.number} · CVV {TEST_CARD.cvv} · any future expiry · PIN {TEST_CARD.pin} · OTP {TEST_CARD.otp}
            </p>
          </Notice>
        </section>
      </div>

      <aside aria-labelledby="order-title" className="self-start rounded-card border border-line bg-raised p-5 shadow-card">
        <h2 id="order-title" className="text-2xl">
          Your order
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {cart.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-3">
              <span>
                {l.productName} <span className="text-muted">({l.size} / {l.colour}) × {l.quantity}</span>
              </span>
              <span className="figures shrink-0">{formatNaira(l.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>
        <dl className="figures mt-4 space-y-2 border-t border-dashed border-line pt-3">
          <div className="flex justify-between gap-4">
            <dt>Subtotal</dt>
            <dd>{formatNaira(cart.subtotalKobo)}</dd>
          </div>
          {cart.coupon ? (
            <div className={`flex justify-between gap-4 ${cart.coupon.problem ? 'text-danger' : 'text-success'}`}>
              <dt>
                Code <span className="font-mono">{cart.coupon.code}</span>
              </dt>
              <dd>{cart.coupon.problem ? 'not valid' : `−${formatNaira(cart.discountKobo)}`}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt>
              Delivery{cart.delivery ? ` to ${cart.delivery.state}` : ''}
              {cart.delivery ? (
                <span className="block text-xs text-muted">
                  {cart.delivery.minDays}–{cart.delivery.maxDays} working days
                </span>
              ) : null}
            </dt>
            <dd>{cart.delivery ? formatNaira(cart.delivery.feeKobo) : '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd>{formatNaira(cart.totalKobo)}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <PlaceOrderForm idempotencyKey={randomUUID()} addressId={chosen?.id ?? null} label={`Pay ${formatNaira(cart.totalKobo)}`} disabledReason={reason} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Prices are checked again when you place the order. <Link href="/cart" className="link">Edit cart</Link>
        </p>
      </aside>
    </div>
  )
}
