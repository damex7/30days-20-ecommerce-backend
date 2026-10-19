// APPLYING A STATUS MOVE inside a transaction: the status, its side
// effects and its history event, all or nothing.
//
// Shared by every path that changes an order's status: staff and API keys
// (lib/services/orders.ts), the expiry sweep (expiry.ts) and payments
// (payments.ts). The caller has already locked the order row and checked
// the move against the table in order-status.ts.
import 'server-only'

import type { Db } from '@/lib/db/executor'
import { releaseCoupon } from '@/lib/repos/coupons'
import { insertOrderEvent, retakeStockForOrder, returnStockForOrder, updateOrderStatus, type OrderRow } from '@/lib/repos/orders'
import { actorIds, actorLabel, type Actor } from './actor'
import { conflict, staleVersion } from './errors'
import type { Transition } from './order-status'

export async function applyMove(
  tx: Db,
  actor: Actor,
  order: OrderRow,
  transition: Transition,
  options: { version: number | null; note?: string | null; metadata?: Record<string, unknown> },
): Promise<number> {
  // Side effects first: if one can't happen (the stock for a late payment
  // is gone), nothing else does either.
  switch (transition.effect) {
    case 'release':
      await returnStockForOrder(tx, order.id)
      await releaseCoupon(tx, order.id)
      break
    case 'restock':
      await returnStockForOrder(tx, order.id)
      break
    case 'retake':
      if (!(await retakeStockForOrder(tx, order.id))) {
        throw conflict('stock_gone', 'The stock this order reserved has since been sold.')
      }
      break
    case 'mark_paid':
    case 'none':
      break
  }

  const newVersion = await updateOrderStatus(tx, {
    id: order.id,
    from: transition.from,
    to: transition.to,
    version: options.version,
    paidAt: transition.to === 'paid',
    cancelledAt: transition.to === 'cancelled' || transition.to === 'refunded',
  })
  if (newVersion === null) throw staleVersion('order', order.version)

  const ids = actorIds(actor)
  await insertOrderEvent(tx, {
    orderId: order.id,
    type: 'status_changed',
    fromStatus: transition.from,
    toStatus: transition.to,
    note: options.note ?? null,
    actorUserId: ids.userId,
    actorApiKeyId: ids.apiKeyId,
    actorLabel: actorLabel(actor),
    metadata: options.metadata,
  })
  return newVersion
}
