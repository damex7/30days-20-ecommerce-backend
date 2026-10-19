// PRICING: pure arithmetic on integer kobo. No database, no I/O, so the
// cart page, the API quote and the checkout transaction all compute
// totals with exactly the same code.
//
// THE RULE: prices come from the database, NEVER from the client. A
// request may say "two of variant 31"; it never says what they cost. The
// cart shows live prices and checkout re-reads them inside its
// transaction, so a tampered request or a stale page can't buy at an old
// or invented price.
import 'server-only'

export type PricedLine = { unitPriceKobo: number; quantity: number }

export function lineTotal(line: PricedLine): number {
  return line.unitPriceKobo * line.quantity
}

export function subtotalOf(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

/**
 * The discount a coupon gives on a subtotal, in whole kobo.
 * - percent: rounded DOWN to the kobo (the shop never gives away a
 *   fraction of a kobo it can't charge), with integer arithmetic only.
 * - fixed: never more than the subtotal (delivery isn't discounted).
 */
export function couponDiscount(coupon: { kind: 'percent' | 'fixed'; value: number }, subtotalKobo: number): number {
  if (coupon.kind === 'percent') return Math.floor((subtotalKobo * coupon.value) / 100)
  return Math.min(coupon.value, subtotalKobo)
}

/** total = subtotal − discount + delivery: the same rule as the orders_total_adds_up CHECK. */
export function totalOf(input: { subtotalKobo: number; discountKobo: number; deliveryFeeKobo: number }): number {
  return input.subtotalKobo - input.discountKobo + input.deliveryFeeKobo
}
