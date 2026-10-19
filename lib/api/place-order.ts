// PLACING AN ORDER, IDEMPOTENTLY: shared by POST /api/v1/orders (the
// Idempotency-Key header) and the checkout page's Server Action (a hidden
// field made when the page rendered), so a double tap on either is safe.
import 'server-only'

import type { RequestInfo } from '@/lib/auth/request'
import { actorOwner, type Actor } from '@/lib/services/actor'
import { placeOrder } from '@/lib/services/checkout'
import { badRequest, unauthorized } from '@/lib/services/errors'
import { runIdempotent } from '@/lib/services/idempotency'
import { getOrder, movesFor } from '@/lib/services/orders'
import { orderDetailJson, type OrderDetailSchema } from './responses'
import type { z } from 'zod'

export const ORDERS_ENDPOINT = 'POST /api/v1/orders'
const KEY_PATTERN = /^[\x21-\x7E]{8,255}$/

export function checkIdempotencyKey(key: string | null): string {
  if (!key) throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header (a new random value, e.g. a UUID, for each order you mean to place).')
  if (!KEY_PATTERN.test(key)) throw badRequest('idempotency_key_invalid', 'An Idempotency-Key is 8 to 255 printable ASCII characters, e.g. a UUID.')
  return key
}

export async function placeOrderIdempotently(actor: Actor, input: { addressId: number }, key: string, info: RequestInfo) {
  if (actor.kind !== 'user' && actor.kind !== 'api_key') throw unauthorized()
  return runIdempotent<z.infer<typeof OrderDetailSchema>>(
    { owner: actorOwner(actor), endpoint: ORDERS_ENDPOINT, key, requestBody: { address_id: input.addressId } },
    async () => {
      const id = await placeOrder(actor, input, info)
      const order = await getOrder(actor, id)
      return {
        status: 201,
        body: orderDetailJson(order, movesFor(actor, order).map((t) => t.to)),
        location: `/api/v1/orders/${id}`,
      }
    },
  )
}
