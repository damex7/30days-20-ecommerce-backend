// ORDERS, ORDER ITEMS, ORDER EVENTS AND STOCK MOVES: SQL only.
//
// OWNERSHIP IS IN THE SQL. A customer's reads pass `customerId`, which
// adds `AND o.customer_id = $customer` to the query. Someone else's order
// id then simply matches nothing, and the service answers 404, exactly as
// for an id that doesn't exist (see the README: why 404 and not 403).
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { empty, join, q, type Sql } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const ORDER_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const OrderRow = z.object({
  id: int8,
  number: z.string(),
  customerId: z.uuid().nullable(),
  customerEmail: z.string(),
  customerName: z.string(),
  status: z.enum(ORDER_STATUSES),
  subtotalKobo: int8,
  discountKobo: int8,
  deliveryFeeKobo: int8,
  totalKobo: int8,
  currency: z.literal('NGN'),
  couponCode: z.string().nullable(),
  shipRecipient: z.string(),
  shipPhone: z.string(),
  shipStreet: z.string(),
  shipCity: z.string(),
  shipState: z.string(),
  shipLandmark: z.string().nullable(),
  deliveryMinDays: z.number().int(),
  deliveryMaxDays: z.number().int(),
  paystackReference: z.string(),
  paystackAuthorizationUrl: z.string().nullable(),
  paidAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  isDemo: z.boolean(),
  itemCount: z.number().int(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cursorTs: z.string(),
})
export type OrderRow = z.infer<typeof OrderRow>

export const OrderItemRow = z.object({
  id: int8,
  orderId: int8,
  variantId: int8,
  productName: z.string(),
  productSlug: z.string(),
  variantLabel: z.string(),
  sku: z.string(),
  unitPriceKobo: int8,
  quantity: z.number().int(),
  lineTotalKobo: int8,
})
export type OrderItemRow = z.infer<typeof OrderItemRow>

export const ORDER_EVENT_TYPES = ['created', 'status_changed', 'payment_received', 'note_added'] as const
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number]

export const OrderEventRow = z.object({
  id: int8,
  orderId: int8,
  type: z.enum(ORDER_EVENT_TYPES),
  fromStatus: z.enum(ORDER_STATUSES).nullable(),
  toStatus: z.enum(ORDER_STATUSES).nullable(),
  note: z.string().nullable(),
  actorLabel: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
})
export type OrderEventRow = z.infer<typeof OrderEventRow>

const orderColumns = q`
  o.id, o.number, o.customer_id AS "customerId", o.customer_email AS "customerEmail", o.customer_name AS "customerName",
  o.status, o.subtotal_kobo AS "subtotalKobo", o.discount_kobo AS "discountKobo",
  o.delivery_fee_kobo AS "deliveryFeeKobo", o.total_kobo AS "totalKobo", o.currency, o.coupon_code AS "couponCode",
  o.ship_recipient AS "shipRecipient", o.ship_phone AS "shipPhone", o.ship_street AS "shipStreet",
  o.ship_city AS "shipCity", o.ship_state AS "shipState", o.ship_landmark AS "shipLandmark",
  o.delivery_min_days AS "deliveryMinDays", o.delivery_max_days AS "deliveryMaxDays",
  o.paystack_reference AS "paystackReference",
  o.paystack_authorization_url AS "paystackAuthorizationUrl", o.paid_at AS "paidAt", o.expires_at AS "expiresAt",
  o.cancelled_at AS "cancelledAt", o.is_demo AS "isDemo", o.version,
  (SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.created_at::text AS "cursorTs"`

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** One order. Pass customerId for a customer: then only THEIR order can match. */
export function findOrder(db: Db, id: number, scope: { customerId?: string }): Promise<OrderRow | null> {
  const owner = scope.customerId ? q`AND o.customer_id = ${scope.customerId}` : empty
  return one(db, OrderRow, q`SELECT ${orderColumns} FROM orders o WHERE o.id = ${id} ${owner}`, 'findOrder')
}

/** Locks the order row until the transaction ends, so a status change and a payment can't interleave. */
export function lockOrder(tx: Db, id: number): Promise<OrderRow | null> {
  return one(tx, OrderRow, q`SELECT ${orderColumns} FROM orders o WHERE o.id = ${id} FOR UPDATE`, 'lockOrder')
}

export function lockOrderByReference(tx: Db, reference: string): Promise<OrderRow | null> {
  return one(tx, OrderRow, q`SELECT ${orderColumns} FROM orders o WHERE o.paystack_reference = ${reference} FOR UPDATE`, 'lockOrderByReference')
}

export function findOrderByReference(db: Db, reference: string, scope: { customerId?: string }): Promise<OrderRow | null> {
  const owner = scope.customerId ? q`AND o.customer_id = ${scope.customerId}` : empty
  return one(db, OrderRow, q`SELECT ${orderColumns} FROM orders o WHERE o.paystack_reference = ${reference} ${owner}`, 'findOrderByReference')
}

export type OrderListQuery = {
  customerId?: string
  statuses?: OrderStatus[]
  from?: Date
  to?: Date
  /** Order number or customer email, for the admin search box. */
  search?: string
  after?: { ts: string; id: number }
  limit: number
}

/**
 * THE ORDER LISTS (EXPLAIN in the README):
 * - a customer: (customer_id, created_at DESC, id DESC) index;
 * - admin with one status: (status, created_at DESC, id DESC) index;
 * - admin, all statuses: (created_at DESC, id DESC).
 * Newest first, cursor on (created_at, id).
 */
export function listOrders(db: Db, query: OrderListQuery): Promise<OrderRow[]> {
  const where: Sql[] = []
  if (query.customerId) where.push(q`o.customer_id = ${query.customerId}`)
  if (query.statuses && query.statuses.length === 1) where.push(q`o.status = ${query.statuses[0]}`)
  else if (query.statuses && query.statuses.length > 1) where.push(q`o.status = ANY(${query.statuses}::text[])`)
  if (query.from) where.push(q`o.created_at >= ${query.from}`)
  if (query.to) where.push(q`o.created_at < ${query.to}`)
  if (query.search) {
    const like = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
    where.push(q`(o.number ILIKE ${like} OR o.customer_email ILIKE ${like} OR o.customer_name ILIKE ${like})`)
  }
  if (query.after) where.push(q`(o.created_at, o.id) < (${query.after.ts}::timestamptz, ${query.after.id})`)
  const whereSql = where.length ? q`WHERE ${join(where, ' AND ')}` : empty
  return rows(db, OrderRow, q`SELECT ${orderColumns} FROM orders o ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ${query.limit + 1}`, 'listOrders')
}

export function listOrderItems(db: Db, orderIds: number[]): Promise<OrderItemRow[]> {
  return rows(
    db,
    OrderItemRow,
    q`SELECT id, order_id AS "orderId", variant_id AS "variantId", product_name AS "productName",
             product_slug AS "productSlug", variant_label AS "variantLabel", sku,
             unit_price_kobo AS "unitPriceKobo", quantity, line_total_kobo AS "lineTotalKobo"
      FROM order_items WHERE order_id = ANY(${orderIds}::bigint[]) ORDER BY order_id, id`,
    'listOrderItems',
  )
}

export function listOrderEvents(db: Db, orderId: number): Promise<OrderEventRow[]> {
  return rows(
    db,
    OrderEventRow,
    q`SELECT id, order_id AS "orderId", type, from_status AS "fromStatus", to_status AS "toStatus", note,
             actor_label AS "actorLabel", metadata, created_at AS "createdAt"
      FROM order_events WHERE order_id = ${orderId} ORDER BY created_at, id`,
    'listOrderEvents',
  )
}

/** Ids of unpaid orders whose 30 minutes are up (partial index orders_pending_expiry_idx). */
export async function listExpiredOrderIds(db: Db, scope: { customerId?: string; orderId?: number; limit: number }): Promise<number[]> {
  const extra = join(
    [
      ...(scope.customerId ? [q`customer_id = ${scope.customerId}`] : []),
      ...(scope.orderId ? [q`id = ${scope.orderId}`] : []),
    ],
    ' AND ',
  )
  const result = await rows(
    db,
    z.object({ id: int8 }),
    q`SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at <= now()
      ${scope.customerId || scope.orderId ? q`AND ${extra}` : empty}
      ORDER BY expires_at LIMIT ${scope.limit}`,
    'listExpiredOrderIds',
  )
  return result.map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type NewOrder = {
  customerId: string
  customerEmail: string
  customerName: string
  subtotalKobo: number
  discountKobo: number
  deliveryFeeKobo: number
  totalKobo: number
  couponCode: string | null
  ship: { recipient: string; phone: string; street: string; city: string; state: string; landmark: string | null }
  deliveryMinDays: number
  deliveryMaxDays: number
  paystackReference: string
  expiresInMinutes: number
  isDemo: boolean
}

export async function insertOrder(tx: Db, order: NewOrder): Promise<{ id: number; number: string }> {
  const result = await rows(
    tx,
    z.object({ id: int8, number: z.string() }),
    q`INSERT INTO orders (
        customer_id, customer_email, customer_name, subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo,
        coupon_code, ship_recipient, ship_phone, ship_street, ship_city, ship_state, ship_landmark,
        delivery_min_days, delivery_max_days, paystack_reference, expires_at, is_demo
      ) VALUES (
        ${order.customerId}, ${order.customerEmail}, ${order.customerName}, ${order.subtotalKobo}, ${order.discountKobo},
        ${order.deliveryFeeKobo}, ${order.totalKobo}, ${order.couponCode}, ${order.ship.recipient}, ${order.ship.phone},
        ${order.ship.street}, ${order.ship.city}, ${order.ship.state}, ${order.ship.landmark},
        ${order.deliveryMinDays}, ${order.deliveryMaxDays}, ${order.paystackReference},
        now() + make_interval(mins => ${order.expiresInMinutes}), ${order.isDemo}
      ) RETURNING id, number`,
    'insertOrder',
  )
  return result[0]!
}

export type NewOrderItem = {
  variantId: number
  productName: string
  productSlug: string
  variantLabel: string
  sku: string
  unitPriceKobo: number
  quantity: number
}

/** All lines in ONE statement: unnest() turns parallel arrays into rows. */
export async function insertOrderItems(tx: Db, orderId: number, items: NewOrderItem[]): Promise<void> {
  await tx.query(q`
    INSERT INTO order_items (order_id, variant_id, product_name, product_slug, variant_label, sku, unit_price_kobo, quantity)
    SELECT ${orderId}, * FROM unnest(
      ${items.map((i) => i.variantId)}::bigint[], ${items.map((i) => i.productName)}::text[],
      ${items.map((i) => i.productSlug)}::text[], ${items.map((i) => i.variantLabel)}::text[],
      ${items.map((i) => i.sku)}::text[], ${items.map((i) => i.unitPriceKobo)}::bigint[],
      ${items.map((i) => i.quantity)}::int[]
    )`)
}

export type NewOrderEvent = {
  orderId: number
  type: OrderEventType
  fromStatus?: OrderStatus | null
  toStatus?: OrderStatus | null
  note?: string | null
  actorUserId: string | null
  actorApiKeyId: string | null
  actorLabel: string
  metadata?: Record<string, unknown>
}

export async function insertOrderEvent(tx: Db, event: NewOrderEvent): Promise<void> {
  await tx.query(q`
    INSERT INTO order_events (order_id, type, from_status, to_status, note, actor_user_id, actor_api_key_id, actor_label, metadata)
    VALUES (${event.orderId}, ${event.type}, ${event.fromStatus ?? null}, ${event.toStatus ?? null}, ${event.note ?? null},
            ${event.actorUserId}, ${event.actorApiKeyId}, ${event.actorLabel}, ${JSON.stringify(event.metadata ?? {})}::jsonb)`)
}

/**
 * A STATUS CHANGE, guarded three ways in one UPDATE:
 *   - status = $from : the order is still in the state the move starts from;
 *   - version = $v   : nobody else changed it since the caller read it
 *                      (skipped for system moves, which hold the row lock);
 *   - and the transition itself was approved by lib/services/order-status.ts.
 * Returns the new version, or null if the guard didn't match.
 */
export async function updateOrderStatus(
  tx: Db,
  input: { id: number; from: OrderStatus; to: OrderStatus; version: number | null; paidAt?: boolean; cancelledAt?: boolean },
): Promise<number | null> {
  const result = await rows(
    tx,
    z.object({ version: z.number().int() }),
    q`UPDATE orders SET
        status = ${input.to},
        version = version + 1,
        paid_at = CASE WHEN ${input.paidAt === true}::boolean THEN now() ELSE paid_at END,
        cancelled_at = CASE WHEN ${input.cancelledAt === true}::boolean THEN now() ELSE cancelled_at END,
        -- An order that is no longer waiting for payment no longer expires.
        expires_at = CASE WHEN ${input.to} = 'pending_payment' THEN expires_at ELSE NULL END
      WHERE id = ${input.id} AND status = ${input.from}
        ${input.version === null ? empty : q`AND version = ${input.version}`}
      RETURNING version`,
    'updateOrderStatus',
  )
  return result[0]?.version ?? null
}

/** Keeps Paystack's checkout link for this order, to reuse on a second "Pay" click. */
export async function savePaymentLink(db: Db, orderId: number, url: string): Promise<void> {
  await db.query(q`UPDATE orders SET paystack_authorization_url = ${url} WHERE id = ${orderId} AND paystack_authorization_url IS NULL`)
}

// ---------------------------------------------------------------------------
// Stock: the guarded moves
// ---------------------------------------------------------------------------

/**
 * TAKES STOCK, or doesn't. The heart of "never oversell":
 *
 *   UPDATE product_variants SET stock = stock - $qty
 *   WHERE id = $variant AND stock >= $qty AND status = 'active'
 *
 * The check and the change are ONE statement on a locked row. Two checkouts
 * for the last pair: the first takes the row lock and the pair; the second
 * waits for the lock, re-checks `stock >= 1` against the NEW value (0), and
 * matches nothing. There is no gap between "is there enough?" and "take
 * it" for another request to slip into. (CHECK stock >= 0 backs it up.)
 *
 * Returns the stock left, or null if there wasn't enough.
 */
export async function takeStock(tx: Db, variantId: number, quantity: number): Promise<number | null> {
  const result = await rows(
    tx,
    z.object({ stock: z.number().int() }),
    q`UPDATE product_variants v SET stock = v.stock - ${quantity}
      FROM products p
      WHERE v.id = ${variantId} AND v.stock >= ${quantity} AND v.status = 'active'
        AND p.id = v.product_id AND p.status = 'active'
      RETURNING v.stock`,
    'takeStock',
  )
  return result[0]?.stock ?? null
}

/** Puts an order's units back on the shelf (expiry, cancellation, refund). */
export async function returnStockForOrder(tx: Db, orderId: number): Promise<void> {
  await tx.query(q`
    UPDATE product_variants v SET stock = v.stock + oi.quantity
    FROM order_items oi
    WHERE oi.order_id = ${orderId} AND v.id = oi.variant_id`)
}

/** For a payment that arrived after expiry: take the units again if they're all still there. */
// All or nothing without a rollback: the variant rows are LOCKED first
// (FOR UPDATE), every line is checked, and only then is anything taken, so
// a "no" leaves the stock untouched and the caller can still record why.
export async function retakeStockForOrder(tx: Db, orderId: number): Promise<boolean> {
  const lines = await rows(
    tx,
    z.object({ stock: z.number().int(), quantity: z.number().int() }),
    q`SELECT v.stock, oi.quantity FROM order_items oi
      JOIN product_variants v ON v.id = oi.variant_id
      WHERE oi.order_id = ${orderId}
      FOR UPDATE OF v`,
    'retakeStockForOrder',
  )
  if (!lines.every((line) => line.stock >= line.quantity)) return false
  // Archived variants may still go to someone who has already paid.
  await tx.query(q`
    UPDATE product_variants v SET stock = v.stock - oi.quantity
    FROM order_items oi
    WHERE oi.order_id = ${orderId} AND v.id = oi.variant_id`)
  return true
}

/** Demo cleanup: delete a demo customer's UNPAID orders (their stock was already returned). */
export async function deleteUnpaidOrdersOf(tx: Db, customerId: string): Promise<number> {
  const result = await tx.query(q`DELETE FROM orders WHERE customer_id = ${customerId} AND paid_at IS NULL AND status IN ('cancelled', 'pending_payment') RETURNING id`)
  return result.length
}
