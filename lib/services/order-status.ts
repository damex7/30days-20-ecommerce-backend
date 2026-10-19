// THE ORDER STATE MACHINE: every allowed status move, in ONE table.
//
// An order's status can't be set to just anything. It moves along these
// edges and no others; anything else is refused with 409 Conflict ("that
// move isn't possible from where the order is now"). Each edge also says
// WHO may make it and what else must happen with it (stock back on the
// shelf, the coupon use given back). The admin page shows only the moves
// this table allows for that order and that person; the API refuses the
// rest; both ask this file.
//
//   pending_payment ──paid──▶ paid ──▶ processing ──▶ shipped ──▶ delivered
//        │                     │            │
//        └──▶ cancelled        └──▶ refunded◀┘
//                │
//                └──▶ paid  (only the payment itself: money that arrived
//                            after the 30 minutes, if the stock is still there)
//
// Every move writes an order_event in the SAME transaction
// (lib/services/orders.ts), so the history can never disagree with the status.
import 'server-only'

import type { OrderStatus } from '@/lib/repos/orders'
import type { Actor } from './actor'
import { conflict, forbidden, notFound } from './errors'
import type { Permission } from './permissions'

/** Who can make a move: the customer who owns the order, shop people (staff/admin sessions), an API key, or the system. */
export type Mover = 'owner' | 'shop_person' | 'api_key' | 'system'

/** What else happens in the same transaction. */
export type Effect =
  | 'none'
  | 'mark_paid' // sets paid_at
  | 'release' // unpaid order ends: stock AND coupon use go back
  | 'restock' // paid order refunded: stock goes back; the coupon WAS used, so it stays used
  | 'retake' // late payment: take the stock again (only if it's all still there)

export type Transition = {
  from: OrderStatus
  to: OrderStatus
  movers: readonly Mover[]
  effect: Effect
  /** The button label on /admin/orders. */
  label: string
}

export const TRANSITIONS: readonly Transition[] = [
  { from: 'pending_payment', to: 'paid', movers: ['system'], effect: 'mark_paid', label: 'Mark paid' },
  { from: 'pending_payment', to: 'cancelled', movers: ['owner', 'shop_person', 'system'], effect: 'release', label: 'Cancel order' },
  { from: 'cancelled', to: 'paid', movers: ['system'], effect: 'retake', label: 'Late payment' },
  { from: 'paid', to: 'processing', movers: ['shop_person', 'api_key'], effect: 'none', label: 'Start processing' },
  { from: 'paid', to: 'refunded', movers: ['shop_person'], effect: 'restock', label: 'Cancel and refund' },
  { from: 'processing', to: 'shipped', movers: ['shop_person', 'api_key'], effect: 'none', label: 'Mark shipped' },
  { from: 'processing', to: 'refunded', movers: ['shop_person'], effect: 'restock', label: 'Cancel and refund' },
  { from: 'shipped', to: 'delivered', movers: ['shop_person', 'api_key'], effect: 'none', label: 'Mark delivered' },
]

/** Statuses an order never leaves. */
export const FINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'refunded']

export function findTransition(from: OrderStatus, to: OrderStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to)
}

/** Which kind of mover this actor is, for this order. */
function moverFor(actor: Actor, order: { customerId: string | null }): Mover | null {
  switch (actor.kind) {
    case 'system':
      return 'system'
    case 'api_key':
      return 'api_key'
    case 'user':
      if (actor.user.role === 'staff' || actor.user.role === 'admin') return 'shop_person'
      return order.customerId === actor.user.id ? 'owner' : null
    case 'anonymous':
      return null
  }
}

/**
 * The permission each mover needs for this edge (checked by authorize(),
 * which also applies API-key scopes and the read-only demo rule).
 */
export function permissionFor(mover: Mover, transition: Transition): Permission | null {
  if (mover === 'system') return null
  if (mover === 'owner') return 'orders.cancel_own'
  if (transition.to === 'refunded') return 'orders.refund'
  return 'orders.fulfil'
}

/**
 * Checks a requested move and returns the edge to apply, or throws:
 *   409 invalid_transition : the table has no such edge from this status
 *   403 not_allowed_to_move: the edge exists but this actor may not make it
 *   404                    : a customer asking about someone else's order
 */
export function checkTransition(actor: Actor, order: { status: OrderStatus; customerId: string | null }, to: OrderStatus): { transition: Transition; mover: Mover } {
  const mover = moverFor(actor, order)
  if (!mover) throw notFound('Order')
  const transition = findTransition(order.status, to)
  if (!transition) {
    const allowed = TRANSITIONS.filter((t) => t.from === order.status && t.movers.includes(mover)).map((t) => t.to)
    throw conflict('invalid_transition', `An order that is ${statusLabel(order.status)} can’t become ${statusLabel(to)}.`, {
      current_status: order.status,
      allowed_next: allowed,
    })
  }
  if (!transition.movers.includes(mover)) {
    throw forbidden('not_allowed_to_move', `You can’t move an order from ${statusLabel(order.status)} to ${statusLabel(to)}.`)
  }
  return { transition, mover }
}

/** The moves to OFFER this actor for this order (the admin page shows only these). */
export function availableMoves(actor: Actor, order: { status: OrderStatus; customerId: string | null }): Transition[] {
  const mover = moverFor(actor, order)
  if (!mover || mover === 'system') return []
  return TRANSITIONS.filter((t) => t.from === order.status && t.movers.includes(mover))
}

const LABELS: Record<OrderStatus, string> = {
  pending_payment: 'awaiting payment',
  paid: 'paid',
  processing: 'processing',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  refunded: 'refunded',
}

export function statusLabel(status: OrderStatus): string {
  return LABELS[status]
}
