// POST /api/v1/orders/{id}/transitions: only moves in lib/services/order-status.ts.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { orderDetailJson } from '@/lib/api/responses'
import { movesFor, transitionOrder } from '@/lib/services/orders'

export const POST = handle(endpoints.transitionOrder, async ({ actor, params, body }) => {
  const order = await transitionOrder(actor, params.id, body)
  return ok(orderDetailJson(order, movesFor(actor, order).map((t) => t.to)))
})
