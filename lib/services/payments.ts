// PAYMENTS: starting one, and the two ways an order becomes paid.
//
//   1. THE CALLBACK: Paystack sends the customer back to
//      /checkout/callback?reference=…, and that page asks Paystack's VERIFY
//      endpoint what happened.
//   2. THE WEBHOOK: Paystack's servers POST charge.success to
//      /api/webhooks/paystack, signed with our secret key.
//
// WHY THE WEBHOOK IS THE SOURCE OF TRUTH. The callback depends on the
// customer's browser: they may close the tab, lose signal in a danfo, or
// the redirect may fail, and then the callback never runs, even though the
// money moved. The webhook is server to server and Paystack RETRIES it
// until we answer 200. The callback is a fast path for a nice "thank you"
// page; the webhook is what guarantees the order is marked paid.
//
// LOCALLY, Paystack can't reach http://localhost (it's not on the
// internet), so no webhook arrives in development and the callback's
// verify does the work. Both paths call applyCharge(), which is idempotent:
// whichever arrives second finds the order already paid and changes nothing.
//
// EVERY CHARGE IS CHECKED against the order before it counts: the amount
// (in kobo) and the currency must match exactly. A charge for ₦100 can't
// pay a ₦45,000 order, whoever sends it.
import 'server-only'

import { appUrl } from '@/lib/auth/email'
import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import { initializeTransaction, PaystackTransaction, verifyTransaction } from '@/lib/paystack'
import { decodeCursor, encodeCursor, toPage, type Page } from '@/lib/pagination'
import * as orders from '@/lib/repos/orders'
import * as events from '@/lib/repos/payment-events'
import type { PaymentEventRow, PaymentOutcome } from '@/lib/repos/payment-events'
import { customerOf, systemActor, type Actor } from './actor'
import { sendPaidOrderEmails } from './emails'
import { conflict, isServiceError, notFound } from './errors'
import { expireDueOrders } from './expiry'
import { applyMove } from './order-moves'
import { findTransition } from './order-status'
import { authorize } from './permissions'

const paystackActor = systemActor('Paystack')

/**
 * Starts (or resumes) paying for an order: returns Paystack's checkout URL.
 * Only the order's owner may, and only while it's still awaiting payment.
 */
export async function startPayment(actor: Actor, orderId: number): Promise<{ authorizationUrl: string; reference: string }> {
  authorize(actor, 'orders.pay_own')
  const customer = customerOf(actor)
  if (!customer) throw new Error('payments: authorize() should have refused a non-customer')
  await expireDueOrders({ orderId, customerId: customer.id, limit: 1 })
  const order = await orders.findOrder(http, orderId, { customerId: customer.id })
  if (!order) throw notFound('Order')
  if (order.status !== 'pending_payment') {
    throw conflict('not_awaiting_payment', order.status === 'cancelled' ? 'This order was cancelled because it wasn’t paid within 30 minutes. Your cart is empty, so add the items again.' : 'This order has already been paid.', { status: order.status })
  }
  // Paystack refuses a second initialize for one reference: reuse the first link.
  if (order.paystackAuthorizationUrl) return { authorizationUrl: order.paystackAuthorizationUrl, reference: order.paystackReference }

  const started = await initializeTransaction({
    email: order.customerEmail,
    amountKobo: order.totalKobo,
    reference: order.paystackReference,
    callbackUrl: appUrl('/checkout/callback'),
    metadata: { order_id: order.id, order_number: order.number },
  })
  await orders.savePaymentLink(http, order.id, started.authorizationUrl)
  return started
}

export type ChargeResult = { outcome: PaymentOutcome | 'duplicate'; orderId: number | null }

/**
 * APPLIES A CHARGE, once. One transaction:
 *   1. record the event: INSERT ... ON CONFLICT (event_id) DO NOTHING. Seen
 *      it before? Stop: it was already handled (Paystack retries, and may
 *      send the same event twice).
 *   2. lock the order by our reference;
 *   3. refuse unless the charge succeeded AND the amount and currency match;
 *   4. move it pending_payment → paid (or, for money that arrived after the
 *      30 minutes, cancelled → paid if the stock can be taken again);
 *   5. record the outcome on the event, for the admin webhook log.
 */
export async function applyCharge(input: {
  source: 'webhook' | 'callback'
  eventId: string
  eventType: string
  transaction: PaystackTransaction
  payload: unknown
}): Promise<ChargeResult> {
  const { transaction: charge } = input
  const result = await withTransaction(async (tx): Promise<ChargeResult & { paidOrder?: orders.OrderRow }> => {
    const eventRowId = await events.recordPaymentEvent(tx, {
      eventId: input.eventId,
      source: input.source,
      eventType: input.eventType,
      reference: charge.reference,
      amountKobo: charge.amount,
      currency: charge.currency,
      payload: input.payload,
    })
    if (eventRowId === null) return { outcome: 'duplicate', orderId: null }

    const finish = async (outcome: PaymentOutcome, orderId: number | null, detail: string | null) => {
      await events.setPaymentOutcome(tx, eventRowId, { outcome, orderId, detail })
      return { outcome, orderId }
    }

    const order = await orders.lockOrderByReference(tx, charge.reference)
    if (!order) return finish('unknown_order', null, 'No order has this reference.')
    if (charge.status !== 'success') return finish('failed', order.id, `Paystack reports the charge as "${charge.status}".`)
    if (charge.amount !== order.totalKobo || charge.currency !== order.currency) {
      return finish('amount_mismatch', order.id, `Charged ${charge.amount} ${charge.currency}; the order is ${order.totalKobo} ${order.currency}. Not marked paid.`)
    }
    if (order.paidAt) return finish('already_paid', order.id, 'The order was already paid (the other path got there first).')

    const metadata = { reference: charge.reference, paystack_transaction: charge.id, amount_kobo: charge.amount, via: input.source }
    if (order.status === 'pending_payment') {
      const transition = findTransition('pending_payment', 'paid')
      if (!transition) throw new Error('order-status table has no pending_payment → paid')
      await applyMove(tx, paystackActor, order, transition, { version: null, note: `Payment received (${input.source}).`, metadata })
      await orders.insertOrderEvent(tx, { orderId: order.id, type: 'payment_received', actorUserId: null, actorApiKeyId: null, actorLabel: 'Paystack', metadata })
      const paid = await finish('paid', order.id, null)
      return { ...paid, paidOrder: order }
    }

    if (order.status === 'cancelled') {
      // Paid after the 30-minute window. Take the stock again if it's all there.
      const transition = findTransition('cancelled', 'paid')
      if (!transition) throw new Error('order-status table has no cancelled → paid')
      try {
        await applyMove(tx, paystackActor, order, transition, { version: null, note: 'Payment arrived after the order had expired; the stock was reserved again.', metadata })
      } catch (error) {
        // Only "the stock is gone" is an expected answer here (no SQL ran
        // before it, so the transaction is still usable). Anything else is real.
        if (!isServiceError(error) || error.code !== 'stock_gone') throw error
        return finish('needs_refund', order.id, 'Paid after the order expired, and the stock has since been sold. Refund the customer from the Paystack dashboard.')
      }
      await orders.insertOrderEvent(tx, { orderId: order.id, type: 'payment_received', actorUserId: null, actorApiKeyId: null, actorLabel: 'Paystack', metadata })
      const paid = await finish('paid', order.id, 'Paid after expiry; stock reserved again.')
      return { ...paid, paidOrder: order }
    }
    return finish('needs_refund', order.id, `Payment received for an order that is ${order.status}. Refund the customer from the Paystack dashboard.`)
  })

  if (result.paidOrder) {
    const fresh = await orders.findOrder(http, result.paidOrder.id, {})
    if (fresh) sendPaidOrderEmails(fresh)
  }
  return { outcome: result.outcome, orderId: result.orderId }
}

/**
 * The CALLBACK path: the customer is back from Paystack. Ask Paystack (never
 * trust the query string: anyone can type ?reference=…) and apply it.
 */
export async function confirmFromCallback(actor: Actor, reference: string): Promise<orders.OrderRow> {
  authorize(actor, 'orders.read_own')
  const customer = customerOf(actor)
  if (!customer) throw new Error('payments: authorize() should have refused a non-customer')
  const order = await orders.findOrderByReference(http, reference, { customerId: customer.id })
  if (!order) throw notFound('Order')
  if (!order.paidAt) {
    const { transaction, raw } = await verifyTransaction(reference)
    // One "verify" event per Paystack transaction: refreshing the page doesn't add rows.
    await applyCharge({ source: 'callback', eventId: `verify:${transaction.id}`, eventType: 'transaction.verify', transaction, payload: raw })
  }
  const fresh = await orders.findOrder(http, order.id, { customerId: customer.id })
  if (!fresh) throw notFound('Order')
  return fresh
}

/** The WEBHOOK path (the signature has already been checked by the route). */
export async function handleWebhookEvent(event: { event: string; data: unknown }, payload: unknown): Promise<ChargeResult> {
  const parsed = event.event === 'charge.success' ? PaystackTransaction.safeParse(event.data) : null
  if (parsed?.success) {
    return applyCharge({ source: 'webhook', eventId: `charge.success:${parsed.data.id}`, eventType: event.event, transaction: parsed.data, payload })
  }
  // An event we don't act on (or a malformed one): log it as ignored, once.
  const data = event.data as { id?: unknown; reference?: unknown } | null
  const id = typeof data?.id === 'number' || typeof data?.id === 'string' ? String(data.id) : `${Date.now()}`
  await withTransaction(async (tx) => {
    const rowId = await events.recordPaymentEvent(tx, {
      eventId: `${event.event}:${id}`,
      source: 'webhook',
      eventType: event.event.slice(0, 60),
      reference: typeof data?.reference === 'string' ? data.reference.slice(0, 100) : null,
      amountKobo: null,
      currency: null,
      payload,
    })
    if (rowId !== null) await events.setPaymentOutcome(tx, rowId, { outcome: 'ignored', orderId: null, detail: `We don't act on ${event.event} events.` })
  })
  return { outcome: 'ignored', orderId: null }
}

/** The admin webhook log. */
export async function listPaymentEvents(actor: Actor, input: { cursor?: string; limit: number }): Promise<Page<PaymentEventRow>> {
  authorize(actor, 'payment_events.read')
  const key = input.cursor ? decodeCursor(input.cursor, 'received', {}) : null
  const rows = await events.listPaymentEvents(http, key ? { ts: String(key[0]), id: Number(key[1]) } : undefined, input.limit)
  return toPage(rows, input.limit, (last) => encodeCursor('received', {}, [last.cursorTs, last.id]))
}
