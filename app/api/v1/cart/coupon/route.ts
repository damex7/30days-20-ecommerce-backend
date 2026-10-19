// PUT/DELETE /api/v1/cart/coupon
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent, ok } from '@/lib/api/handler'
import { cartJson } from '@/lib/api/responses'
import { applyCoupon, removeCoupon } from '@/lib/services/cart'

export const PUT = handle(endpoints.applyCoupon, async ({ actor, body }) => ok(cartJson(await applyCoupon(actor, body.code))))

export const DELETE = handle(endpoints.removeCoupon, async ({ actor }) => {
  await removeCoupon(actor)
  return noContent()
})
