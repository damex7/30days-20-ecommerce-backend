// GET /api/v1/orders/{id}: someone else's order is 404, like a missing one.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { orderDetailJson } from '@/lib/api/responses'
import { getOrder, movesFor } from '@/lib/services/orders'

export const GET = handle(endpoints.getOrder, async ({ actor, params }) => {
  const order = await getOrder(actor, params.id)
  return ok(orderDetailJson(order, movesFor(actor, order).map((t) => t.to)))
})
