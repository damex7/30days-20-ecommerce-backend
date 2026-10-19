// THE CART: live prices, live stock, and the coupon explained.
//
// Every cart view re-reads prices and stock, so what the customer sees is
// what checkout will charge (checkout re-reads them once more, inside its
// transaction). Problems are REPORTED per line rather than silently fixed:
// "only 1 left" or "no longer available", so the customer decides.
import 'server-only'

import { http, type Db } from '@/lib/db/executor'
import * as addressesRepo from '@/lib/repos/addresses'
import * as repo from '@/lib/repos/carts'
import type { CartLineRow } from '@/lib/repos/carts'
import * as couponsRepo from '@/lib/repos/coupons'
import * as products from '@/lib/repos/products'
import { customerOf, type Actor } from './actor'
import { checkCode, evaluateCoupon } from './coupons'
import { conflict, invalid, notFound } from './errors'
import { authorize } from './permissions'
import { subtotalOf, totalOf } from './pricing'

export const MAX_QUANTITY = 20

export type LineProblem = 'unavailable' | 'insufficient_stock' | null

export type CartLine = CartLineRow & {
  lineTotalKobo: number
  problem: LineProblem
  /** How many can be bought right now (0 when unavailable). */
  available: number
}

export type CartView = {
  id: number
  lines: CartLine[]
  itemCount: number
  subtotalKobo: number
  coupon: { code: string; discountKobo: number; problem: string | null } | null
  discountKobo: number
  delivery: { state: string; feeKobo: number; minDays: number; maxDays: number } | null
  /** subtotal − discount + delivery; delivery counts only once an address is chosen. */
  totalKobo: number
  /** Can checkout start? false when any line has a problem or the cart is empty. */
  ready: boolean
}

function ownerId(actor: Actor): string {
  const customer = customerOf(actor)
  if (!customer) throw new Error('cart: authorize() should have refused a non-customer')
  return customer.id
}

function describeLine(line: CartLineRow): CartLine {
  const sellable = line.productStatus === 'active' && line.variantStatus === 'active'
  const available = sellable ? line.stock : 0
  const problem: LineProblem = !sellable || available === 0 ? 'unavailable' : line.quantity > available ? 'insufficient_stock' : null
  return { ...line, lineTotalKobo: line.priceKobo * line.quantity, problem, available }
}

/** Builds the cart view (used by GET /cart, the cart page, and checkout's preview). */
export async function buildCartView(db: Db, customerId: string, addressId?: number): Promise<CartView> {
  const cart = await repo.ensureCart(db, customerId)
  const lines = (await repo.listCartLines(db, cart.id)).map(describeLine)
  const priced = lines.filter((l) => l.problem !== 'unavailable')
  const subtotalKobo = subtotalOf(priced.map((l) => ({ unitPriceKobo: l.priceKobo, quantity: l.quantity })))

  let coupon: CartView['coupon'] = null
  if (cart.couponId) {
    const row = await couponsRepo.findCouponById(db, cart.couponId)
    if (row) {
      const uses = await couponsRepo.countRedemptions(db, row.id, customerId)
      const check = evaluateCoupon(row, { subtotalKobo, customerUses: uses, now: new Date() })
      coupon = { code: row.code, discountKobo: check.ok ? check.discountKobo : 0, problem: check.ok ? null : check.message }
    }
  }

  let delivery: CartView['delivery'] = null
  if (addressId !== undefined) {
    const address = await addressesRepo.findAddress(db, customerId, addressId)
    if (!address) throw notFound('Address')
    const fee = await addressesRepo.findDeliveryFee(db, address.state)
    if (fee) delivery = { state: fee.state, feeKobo: fee.feeKobo, minDays: fee.minDays, maxDays: fee.maxDays }
  }

  const discountKobo = coupon?.discountKobo ?? 0
  return {
    id: cart.id,
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalKobo,
    coupon,
    discountKobo,
    delivery,
    totalKobo: totalOf({ subtotalKobo, discountKobo, deliveryFeeKobo: delivery?.feeKobo ?? 0 }),
    ready: lines.length > 0 && lines.every((l) => l.problem === null) && (coupon === null || coupon.problem === null),
  }
}

export async function getCart(actor: Actor, input: { addressId?: number } = {}): Promise<CartView> {
  authorize(actor, 'cart.own')
  return buildCartView(http, ownerId(actor), input.addressId)
}

/** A small count for the header badge; never creates a cart. */
export async function cartCount(actor: Actor): Promise<number> {
  const customer = customerOf(actor)
  if (!customer) return 0
  const cart = await repo.findCart(http, customer.id)
  if (!cart) return 0
  const lines = await repo.listCartLines(http, cart.id)
  return lines.reduce((n, l) => n + l.quantity, 0)
}

async function sellableVariant(variantId: number) {
  const variant = await products.findVariant(http, variantId)
  if (!variant || variant.status !== 'active') return null
  const product = await products.findProductById(http, variant.productId)
  if (!product || product.status !== 'active') return null
  return variant
}

/**
 * Adds a variant (or more of it). Refused with 409 if that would put more
 * in the cart than is on the shelf. Stock isn't RESERVED here: carts are
 * wishes; only an order reserves stock, for 30 minutes.
 */
export async function addItem(actor: Actor, input: { variantId: number; quantity: number }): Promise<CartView> {
  authorize(actor, 'cart.own')
  const customerId = ownerId(actor)
  const variant = await sellableVariant(input.variantId)
  if (!variant) throw invalid('unknown_variant', 'That item isn’t for sale.', [{ field: 'variant_id', message: 'Choose a size and colour that is available.' }])

  const cart = await repo.ensureCart(http, customerId)
  const inCart = (await repo.listCartLines(http, cart.id)).find((l) => l.variantId === variant.id)?.quantity ?? 0
  const wanted = Math.min(inCart + input.quantity, MAX_QUANTITY)
  if (variant.stock === 0) throw conflict('out_of_stock', `${variant.size} / ${variant.colour} is sold out.`, { available: 0 })
  if (wanted > variant.stock) {
    throw conflict('insufficient_stock', `Only ${variant.stock} left in ${variant.size} / ${variant.colour}${inCart ? `, and ${inCart} ${inCart === 1 ? 'is' : 'are'} already in your cart` : ''}.`, {
      available: variant.stock,
      in_cart: inCart,
    })
  }
  await repo.addCartItem(http, cart.id, variant.id, input.quantity)
  return buildCartView(http, customerId)
}

export async function updateItem(actor: Actor, itemId: number, quantity: number): Promise<CartView> {
  authorize(actor, 'cart.own')
  const customerId = ownerId(actor)
  const item = await repo.findCartItem(http, customerId, itemId)
  if (!item) throw notFound('Cart item')
  const variant = await products.findVariant(http, item.variantId)
  if (variant && quantity > item.quantity && quantity > variant.stock) {
    throw conflict('insufficient_stock', `Only ${variant.stock} left in ${variant.size} / ${variant.colour}.`, { available: variant.stock })
  }
  await repo.setCartItemQuantity(http, customerId, itemId, quantity)
  return buildCartView(http, customerId)
}

export async function removeItem(actor: Actor, itemId: number): Promise<CartView> {
  authorize(actor, 'cart.own')
  const customerId = ownerId(actor)
  if (!(await repo.removeCartItem(http, customerId, itemId))) throw notFound('Cart item')
  return buildCartView(http, customerId)
}

/**
 * Applies a code to the cart. Refused (422, with the reason under the code
 * field) if it can't be used right now: unknown, expired, used up, minimum
 * not met, already used by this customer.
 */
export async function applyCoupon(actor: Actor, code: string): Promise<CartView> {
  authorize(actor, 'cart.own')
  const customerId = ownerId(actor)
  const view = await buildCartView(http, customerId)
  if (view.lines.length === 0) throw conflict('cart_empty', 'Add something to your cart before applying a code.')
  const { coupon, check } = await checkCode(http, code, customerId, view.subtotalKobo)
  if (!check.ok || !coupon) {
    const message = check.ok ? 'That code can’t be used.' : check.message
    throw invalid(`coupon_${check.ok ? 'unknown' : check.problem}`, message, [{ field: 'code', message }])
  }
  await repo.setCartCoupon(http, view.id, coupon.id)
  return buildCartView(http, customerId)
}

export async function removeCoupon(actor: Actor): Promise<CartView> {
  authorize(actor, 'cart.own')
  const customerId = ownerId(actor)
  const cart = await repo.ensureCart(http, customerId)
  await repo.setCartCoupon(http, cart.id, null)
  return buildCartView(http, customerId)
}
