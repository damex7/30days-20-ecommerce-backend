// PATCH/DELETE /api/v1/cart/items/{id}
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent, ok } from '@/lib/api/handler'
import { cartJson } from '@/lib/api/responses'
import { removeItem, updateItem } from '@/lib/services/cart'

export const PATCH = handle(endpoints.updateCartItem, async ({ actor, params, body }) => ok(cartJson(await updateItem(actor, params.id, body.quantity))))

export const DELETE = handle(endpoints.deleteCartItem, async ({ actor, params }) => {
  await removeItem(actor, params.id)
  return noContent()
})
