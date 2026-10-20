// CHECKOUT: the cart becomes an order, in ONE transaction.
//
// Everything below happens between one BEGIN and one COMMIT
// (lib/db/tx.ts). If anything fails (a size sold out a second ago, the
// coupon's last use went to someone else), the whole transaction rolls
// back: no stock taken, no coupon used, no half-made order, the cart as
// it was. The answer then says exactly what to fix.
//
//   1. lock the customer's cart (their checkouts run one at a time)
//   2. load the delivery address (must be theirs)
//   3. re-read every line's price and stock FROM THE DATABASE
//   4. take the stock with a guarded UPDATE per line (never oversell)
//   5. re-check and CLAIM the coupon with a guarded UPDATE
//   6. look up the delivery fee for the address's state
//   7. insert the order (with the address and prices COPIED in), its
//      lines, the coupon redemption and the "created" event
//   8. empty the cart
import 'server-only'

import { randomBytes } from 'node:crypto'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { withTransaction } from '@/lib/db/tx'
import * as addressesRepo from '@/lib/repos/addresses'
import * as cartsRepo from '@/lib/repos/carts'
import * as couponsRepo from '@/lib/repos/coupons'
import * as ordersRepo from '@/lib/repos/orders'
import { actorIds, actorLabel, customerOf, type Actor } from './actor'
import { evaluateCoupon } from './coupons'
import { conflict, forbidden, invalid, ServiceError } from './errors'
import { PAYMENT_WINDOW_MINUTES } from './expiry'
import { authorize } from './permissions'
import { subtotalOf, totalOf } from './pricing'

export type ShortItem = { variant_id: number; sku: string; name: string; requested: number; available: number }

/** Our payment reference at Paystack: unguessable, unique, URL-safe. */
function newReference(): string {
  return `oja_${randomBytes(12).toString('base64url')}`
}

/** Places an order from the customer's cart. Returns the new order's id. */
export async function placeOrder(actor: Actor, input: { addressId: number }, request: { ip: string }): Promise<number> {
  authorize(actor, 'orders.place')
  const customer = customerOf(actor)
  if (!customer) throw new Error('checkout: authorize() should have refused a non-customer')
  // The receipt goes to this address, so it must be one the customer has proved is theirs.
  if (!customer.emailVerifiedAt) throw forbidden('email_not_verified', 'Confirm your email address before placing an order. We’ve sent you a link.')

  // RATE LIMIT (Day 17's limiter, a new action): ten orders an hour per
  // customer is generous for a person and stops a script hoarding stock.
  const limit = await checkRateLimit('order', request.ip, customer.id)
  if (!limit.ok) throw new ServiceError('rate_limited', 'rate_limited', limit.message, { retryAfterSeconds: limit.retryAfterSeconds })

  return withTransaction(async (tx) => {
    // 1. One checkout at a time per customer.
    const cart = await cartsRepo.lockCart(tx, customer.id)
    const lines = cart ? await cartsRepo.listCartLines(tx, cart.id) : []
    if (!cart || lines.length === 0) throw conflict('cart_empty', 'Your cart is empty.')

    // 2. Ownership is in the query: someone else's address id finds nothing.
    const address = await addressesRepo.findAddress(tx, customer.id, input.addressId)
    if (!address) throw invalid('unknown_address', 'Choose one of your saved delivery addresses.', [{ field: 'address_id', message: 'That address isn’t in your address book.' }])

    // 3 + 4. Live prices; take the stock line by line. We keep going after
    // a shortage so the answer can list EVERY short line at once.
    const short: ShortItem[] = []
    for (const line of lines) {
      const sellable = line.productStatus === 'active' && line.variantStatus === 'active'
      const left = sellable ? await ordersRepo.takeStock(tx, line.variantId, line.quantity) : null
      if (left === null) {
        // Re-read the stock NOW: under READ COMMITTED this new statement sees
        // what a checkout that just won the race left behind, not the figure
        // the cart was read with a moment ago.
        const available = sellable ? await ordersRepo.currentStock(tx, line.variantId) : 0
        short.push({ variant_id: line.variantId, sku: line.sku, name: `${line.productName} (${line.size} / ${line.colour})`, requested: line.quantity, available })
      }
    }
    if (short.length > 0) {
      // Throwing rolls back every stock change made above.
      const names = short.map((s) => (s.available === 0 ? `${s.name} is sold out` : `only ${s.available} of ${s.name} left`)).join('; ')
      throw conflict('out_of_stock', `Some items no longer have enough stock: ${names}. Update your cart and try again.`, { short_items: short })
    }
    const subtotalKobo = subtotalOf(lines.map((l) => ({ unitPriceKobo: l.priceKobo, quantity: l.quantity })))

    // 5. The coupon, re-checked now and claimed with a guarded UPDATE.
    let discountKobo = 0
    let coupon: couponsRepo.CouponRow | null = null
    if (cart.couponId) {
      coupon = await couponsRepo.findCouponById(tx, cart.couponId)
      if (coupon) {
        const uses = await couponsRepo.countRedemptions(tx, coupon.id, customer.id)
        const check = evaluateCoupon(coupon, { subtotalKobo, customerUses: uses, now: new Date() })
        if (!check.ok) throw invalid(`coupon_${check.problem}`, `${check.message} Remove the code to continue without it.`, [{ field: 'coupon', message: check.message }])
        if (!(await couponsRepo.claimCoupon(tx, coupon.id, customer.id))) {
          throw invalid('coupon_used_up', `The code ${coupon.code} was just used up. Remove it to continue.`, [{ field: 'coupon', message: 'This code has just run out.' }])
        }
        discountKobo = check.discountKobo
      }
    }

    // 6. Delivery for the address's state (the FK guarantees a row exists).
    const fee = await addressesRepo.findDeliveryFee(tx, address.state)
    if (!fee) throw invalid('unknown_state', 'We don’t deliver to that state.', [{ field: 'address_id', message: 'Choose an address in Nigeria.' }])

    // 7. The order, with everything COPIED in as it is right now.
    const totalKobo = totalOf({ subtotalKobo, discountKobo, deliveryFeeKobo: fee.feeKobo })
    const order = await ordersRepo.insertOrder(tx, {
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      subtotalKobo,
      discountKobo,
      deliveryFeeKobo: fee.feeKobo,
      totalKobo,
      couponCode: coupon?.code ?? null,
      ship: { recipient: address.recipientName, phone: address.phone, street: address.street, city: address.city, state: address.state, landmark: address.landmark },
      deliveryMinDays: fee.minDays,
      deliveryMaxDays: fee.maxDays,
      paystackReference: newReference(),
      expiresInMinutes: PAYMENT_WINDOW_MINUTES,
      isDemo: customer.isDemo,
    })
    await ordersRepo.insertOrderItems(
      tx,
      order.id,
      lines.map((l) => ({
        variantId: l.variantId,
        productName: l.productName,
        productSlug: l.productSlug,
        variantLabel: `Size ${l.size} · ${l.colour}`,
        sku: l.sku,
        unitPriceKobo: l.priceKobo,
        quantity: l.quantity,
      })),
    )
    if (coupon) await couponsRepo.insertRedemption(tx, { couponId: coupon.id, customerId: customer.id, orderId: order.id, discountKobo })
    const ids = actorIds(actor)
    await ordersRepo.insertOrderEvent(tx, {
      orderId: order.id,
      type: 'created',
      toStatus: 'pending_payment',
      actorUserId: ids.userId,
      actorApiKeyId: ids.apiKeyId,
      actorLabel: actorLabel(actor),
      metadata: { total_kobo: totalKobo, items: lines.length, coupon: coupon?.code ?? null },
    })

    // 8. The cart's work is done.
    await cartsRepo.clearCart(tx, cart.id)
    return order.id
  })
}
