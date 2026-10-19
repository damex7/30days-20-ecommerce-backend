// DEMO MODE (DEMO_MODE=true): one-click accounts for portfolio visitors.
//
//   "Shop as a customer" → a FRESH customer account per click, isolated
//                          from every other visitor, deleted after 24 hours.
//   "View as staff/admin" → shared seeded accounts that are READ-ONLY: the
//                          rule lives in ONE place, authorize() in
//                          lib/services/permissions.ts, so every write is
//                          refused whichever page or API route asks.
//
// With DEMO_MODE off, none of this is reachable: the buttons aren't shown
// and the actions answer "not found".
import 'server-only'

import { randomBytes } from 'node:crypto'
import { DEMO_EMAIL_DOMAIN } from '@/lib/auth/email'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import type { RequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import { insertAddress } from '@/lib/repos/addresses'
import { addCartItem, ensureCart } from '@/lib/repos/carts'
import * as repo from '@/lib/repos/demo'
import { deleteUnpaidOrdersOf, lockOrder } from '@/lib/repos/orders'
import { systemActor } from './actor'
import { notFound, ServiceError } from './errors'
import { applyMove } from './order-moves'
import { findTransition } from './order-status'

export const DEMO_STAFF_EMAIL = `demo-staff@${DEMO_EMAIL_DOMAIN}`
export const DEMO_ADMIN_EMAIL = `demo-admin@${DEMO_EMAIL_DOMAIN}`
export const DEMO_CUSTOMER_LIFETIME_HOURS = 24

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true'
}

function requireDemoMode() {
  if (!isDemoMode()) throw notFound('Page')
}

async function limitPerIp(request: RequestInfo) {
  const limit = await checkRateLimit('demo', request.ip, null)
  if (!limit.ok) throw new ServiceError('rate_limited', 'rate_limited', limit.message, { retryAfterSeconds: limit.retryAfterSeconds })
}

/**
 * A brand-new demo customer, signed in, with a Lagos address and two
 * things in the cart, so the visitor can go straight to checkout.
 */
export async function startDemoCustomer(request: RequestInfo): Promise<void> {
  requireDemoMode()
  await limitPerIp(request)
  const userId = await withTransaction(async (tx) => {
    const email = `demo-${randomBytes(6).toString('hex')}@${DEMO_EMAIL_DOMAIN}`
    const id = await repo.insertDemoCustomer(tx, { email, name: 'Demo shopper' })
    await insertAddress(tx, id, {
      label: 'Home',
      recipientName: 'Demo shopper',
      phone: '+2348000000000',
      street: '12 Admiralty Way',
      city: 'Lekki Phase 1',
      state: 'Lagos',
      landmark: 'Near the Lekki toll gate',
      isDefault: true,
    })
    const cart = await ensureCart(tx, id)
    for (const { variantId } of await repo.pickDemoVariants(tx, 2)) await addCartItem(tx, cart.id, variantId, 1)
    return id
  })
  await startSession(userId, request, { type: 'demo_started', userId, request, metadata: { role: 'customer' } })
}

/** Signs in as the shared, read-only demo staff or admin account. */
export async function startDemoShopAccount(role: 'staff' | 'admin', request: RequestInfo): Promise<void> {
  requireDemoMode()
  await limitPerIp(request)
  const userId = await repo.findDemoAccount(http, role === 'admin' ? DEMO_ADMIN_EMAIL : DEMO_STAFF_EMAIL)
  if (!userId) throw new ServiceError('unavailable', 'demo_not_seeded', 'The demo accounts haven’t been set up yet. Run npm run db:seed.')
  await startSession(userId, request, { type: 'demo_started', userId, request, metadata: { role } })
}

const cleanupActor = systemActor('Demo cleanup')

/**
 * THE 24-HOUR CLEANUP (from the daily cron). For each old demo customer,
 * in ONE transaction:
 *   1. cancel their unpaid orders, giving the reserved stock and coupon
 *      uses back (the same move as expiry, with an order_event);
 *   2. delete those unpaid orders;
 *   3. delete the user: their cart, addresses and sessions go with it
 *      (CASCADE); PAID demo orders stay, detached (SET NULL) and still
 *      flagged is_demo, so they're kept out of real sales figures.
 */
export async function cleanupDemoCustomers(limit = 200): Promise<number> {
  const ids = await repo.listExpiredDemoCustomers(http, DEMO_CUSTOMER_LIFETIME_HOURS, limit)
  const cancel = findTransition('pending_payment', 'cancelled')
  if (!cancel) throw new Error('order-status table has no pending_payment → cancelled')
  let removed = 0
  for (const id of ids) {
    const done = await withTransaction(async (tx) => {
      for (const orderId of await repo.listPendingOrderIdsOf(tx, id)) {
        const order = await lockOrder(tx, orderId)
        if (order && order.status === 'pending_payment') {
          await applyMove(tx, cleanupActor, order, cancel, { version: null, note: 'Demo account removed after 24 hours; stock released.' })
        }
      }
      await deleteUnpaidOrdersOf(tx, id)
      return repo.deleteDemoCustomer(tx, id)
    })
    if (done) removed++
  }
  return removed
}
