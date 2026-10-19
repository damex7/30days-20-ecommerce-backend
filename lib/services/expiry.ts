// UNPAID ORDERS EXPIRE after 30 minutes, giving their stock and coupon use back.
//
// An order RESERVES its stock the moment it's placed (checkout takes it
// off the shelf), so a customer who goes to Paystack can't find their
// sandals sold to someone else while they type their card number. But a
// customer who never pays must not hold stock forever.
//
// TWO WAYS IT HAPPENS, and both are needed:
//   1. LAZILY, whenever orders are read: listing a customer's orders, opening
//      one, the admin orders page. A due order is expired right there,
//      before it's shown, so nobody ever sees a "pending" order that should
//      be gone. It costs one indexed query when nothing is due.
//   2. A DAILY CRON (/api/cron/expire-orders, vercel.json). Vercel's free
//      plan runs cron jobs at most once a day, so the cron alone would leave
//      stock locked for up to 24 hours; lazy expiry alone would never release
//      stock for orders nobody looks at again. Together: correct whenever
//      anyone looks, and tidy at least daily.
import 'server-only'

import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import { listExpiredOrderIds, lockOrder } from '@/lib/repos/orders'
import { systemActor } from './actor'
import { applyMove } from './order-moves'
import { findTransition } from './order-status'

export const PAYMENT_WINDOW_MINUTES = 30

const expiryActor = systemActor('Expiry sweep')

/** Expires ONE order if it is still pending and its time is up. Returns whether it did. */
async function expireOne(orderId: number): Promise<boolean> {
  return withTransaction(async (tx) => {
    // Lock, then re-check: a payment may have landed a moment ago.
    const order = await lockOrder(tx, orderId)
    if (!order || order.status !== 'pending_payment' || !order.expiresAt || order.expiresAt > new Date()) return false
    const transition = findTransition('pending_payment', 'cancelled')
    if (!transition) throw new Error('order-status table has no pending_payment → cancelled')
    await applyMove(tx, expiryActor, order, transition, {
      version: null,
      note: `Not paid within ${PAYMENT_WINDOW_MINUTES} minutes. The reserved stock and any coupon use were released.`,
      metadata: { reason: 'payment_window_expired' },
    })
    return true
  })
}

/**
 * Expires due orders. Scope it to a customer or one order for the lazy
 * check; leave it open (with a limit) for the admin page and the cron.
 * Each order gets its own short transaction, so one problem order can't
 * hold up the rest.
 */
export async function expireDueOrders(scope: { customerId?: string; orderId?: number; limit?: number } = {}): Promise<number> {
  const ids = await listExpiredOrderIds(http, { customerId: scope.customerId, orderId: scope.orderId, limit: scope.limit ?? 50 })
  let expired = 0
  for (const id of ids) if (await expireOne(id)) expired++
  return expired
}
