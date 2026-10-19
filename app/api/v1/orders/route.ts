// GET/POST /api/v1/orders
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { checkIdempotencyKey, placeOrderIdempotently } from '@/lib/api/place-order'
import { orderJson } from '@/lib/api/responses'
import { listOrders } from '@/lib/services/orders'

export const GET = handle(endpoints.listOrders, async ({ actor, query }) => {
  const page = await listOrders(actor, query)
  return ok({ data: page.items.map(orderJson), next_cursor: page.nextCursor })
})

// The same key + the same body → the SAME saved response (and
// Idempotent-Replayed: true). See lib/services/idempotency.ts.
export const POST = handle(endpoints.createOrder, async ({ actor, body, request, info }) => {
  const key = checkIdempotencyKey(request.headers.get('idempotency-key'))
  const result = await placeOrderIdempotently(actor, body, key, info)
  return {
    status: 201,
    body: result.body,
    location: result.location ?? undefined,
    headers: { 'Idempotent-Replayed': result.replayed ? 'true' : 'false' },
  }
})
