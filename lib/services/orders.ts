// ORDERS: reading them (with ownership), moving them along, adding notes.
//
// WHY SOMEONE ELSE'S ORDER IS 404, NOT 403. "403 Forbidden" would confirm
// that order 4127 EXISTS and belongs to somebody else. Answering 404 for
// both "doesn't exist" and "isn't yours" means a customer poking at ids
// learns nothing: not how many orders the shop has, not which ids are real.
// It also falls out of the design: the customer's query filters on
// customer_id, so their view of the table simply doesn't contain it.
import 'server-only'

import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import { decodeCursor, encodeCursor, toPage, type Page } from '@/lib/pagination'
import * as repo from '@/lib/repos/orders'
import type { OrderEventRow, OrderItemRow, OrderRow, OrderStatus } from '@/lib/repos/orders'
import { actorIds, actorLabel, customerOf, isShopSide, type Actor } from './actor'
import { notFound, staleVersion } from './errors'
import { expireDueOrders } from './expiry'
import { applyMove } from './order-moves'
import { availableMoves, checkTransition, permissionFor, type Transition } from './order-status'
import { authorize } from './permissions'
import { HIDDEN, maskEmail, maskPhone, forViewer } from './privacy'

export type OrderDetail = OrderRow & { items: OrderItemRow[] }

/** Demo staff/admin never see a real person's contact details (lib/services/privacy.ts). */
function maskOrder<T extends OrderRow>(actor: Actor, order: T): T {
  return forViewer(actor, order, (o) => ({
    ...o,
    customerEmail: maskEmail(o.customerEmail),
    shipPhone: maskPhone(o.shipPhone),
    shipStreet: HIDDEN,
    shipLandmark: o.shipLandmark ? HIDDEN : null,
  }))
}

/** Who is reading: a customer sees only their own orders; the shop side sees all. */
function readScope(actor: Actor): { customerId?: string } {
  if (isShopSide(actor)) {
    authorize(actor, 'orders.read_all')
    return {}
  }
  authorize(actor, 'orders.read_own')
  const customer = customerOf(actor)
  if (!customer) throw new Error('orders: authorize() should have refused this actor')
  return { customerId: customer.id }
}

export type OrderListInput = {
  status?: OrderStatus
  from?: Date
  to?: Date
  q?: string
  cursor?: string
  limit: number
}

export async function listOrders(actor: Actor, input: OrderListInput): Promise<Page<OrderRow>> {
  const scope = readScope(actor)
  // LAZY EXPIRY: release anything overdue before showing the list.
  await expireDueOrders({ customerId: scope.customerId, limit: 50 })

  // Customers can't search or filter by date (their list is short); the shop can.
  const shop = scope.customerId === undefined
  const filters = { status: input.status, from: shop ? input.from?.toISOString() : undefined, to: shop ? input.to?.toISOString() : undefined, q: shop ? input.q : undefined }
  const key = input.cursor ? decodeCursor(input.cursor, 'newest', filters) : null
  const result = await repo.listOrders(http, {
    customerId: scope.customerId,
    statuses: input.status ? [input.status] : undefined,
    from: shop ? input.from : undefined,
    to: shop ? input.to : undefined,
    search: shop ? input.q : undefined,
    after: key ? { ts: String(key[0]), id: Number(key[1]) } : undefined,
    limit: input.limit,
  })
  const page = toPage(result, input.limit, (last) => encodeCursor('newest', filters, [last.cursorTs, last.id]))
  return { ...page, items: page.items.map((o) => maskOrder(actor, o)) }
}

export async function getOrder(actor: Actor, id: number): Promise<OrderDetail> {
  const scope = readScope(actor)
  await expireDueOrders({ orderId: id, customerId: scope.customerId, limit: 1 })
  const order = await repo.findOrder(http, id, scope)
  if (!order) throw notFound('Order')
  const items = await repo.listOrderItems(http, [order.id])
  return { ...maskOrder(actor, order), items }
}

/** For the callback page: the order a Paystack reference belongs to (still owner-scoped). */
export async function getOrderByReference(actor: Actor, reference: string): Promise<OrderRow> {
  const scope = readScope(actor)
  const order = await repo.findOrderByReference(http, reference, scope)
  if (!order) throw notFound('Order')
  return maskOrder(actor, order)
}

export async function getOrderEvents(actor: Actor, id: number): Promise<OrderEventRow[]> {
  const scope = readScope(actor)
  const order = await repo.findOrder(http, id, scope)
  if (!order) throw notFound('Order')
  return repo.listOrderEvents(http, id)
}

/** The moves the UI should offer this actor for this order (the API enforces them anyway). */
export function movesFor(actor: Actor, order: OrderRow): Transition[] {
  return availableMoves(actor, order)
}

/**
 * MOVES AN ORDER ALONG, in one transaction:
 *   1. lock the order row (FOR UPDATE), so a payment or another staff
 *      member can't change it halfway through;
 *   2. ownership: a customer's lock on someone else's order looks exactly
 *      like a missing order (404);
 *   3. lazy expiry on the locked row: an overdue unpaid order becomes
 *      cancelled first, so "pay"/"cancel" decisions use the truth;
 *   4. the version the client read must still be current (else 409);
 *   5. the move must be in the state machine's table, for this actor (409 / 403);
 *   6. its side effects (stock, coupon), the new status and the
 *      order_event are written together.
 */
export async function transitionOrder(actor: Actor, id: number, input: { to: OrderStatus; version: number; note?: string | null }): Promise<OrderDetail> {
  const scope = readScope(actor)
  // Expire first, in its own transaction, so the move below sees the truth.
  await expireDueOrders({ orderId: id, customerId: scope.customerId, limit: 1 })

  await withTransaction(async (tx) => {
    const order = await repo.lockOrder(tx, id)
    if (!order || (scope.customerId && order.customerId !== scope.customerId)) throw notFound('Order')
    if (order.version !== input.version) throw staleVersion('order', order.version)
    const { transition, mover } = checkTransition(actor, order, input.to)
    const permission = permissionFor(mover, transition)
    if (permission) authorize(actor, permission)
    await applyMove(tx, actor, order, transition, { version: input.version, note: input.note ?? null })
  })
  return getOrder(actor, id)
}

export async function addNote(actor: Actor, id: number, note: string): Promise<OrderEventRow[]> {
  authorize(actor, 'orders.fulfil')
  await withTransaction(async (tx) => {
    const order = await repo.lockOrder(tx, id)
    if (!order) throw notFound('Order')
    const ids = actorIds(actor)
    await repo.insertOrderEvent(tx, { orderId: id, type: 'note_added', note, actorUserId: ids.userId, actorApiKeyId: ids.apiKeyId, actorLabel: actorLabel(actor) })
  })
  return repo.listOrderEvents(http, id)
}
