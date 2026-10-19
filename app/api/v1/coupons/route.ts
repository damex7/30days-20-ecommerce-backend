// GET/POST /api/v1/coupons (admin)
import { endpoints } from '@/lib/api/endpoints'
import { created, handle, ok } from '@/lib/api/handler'
import { couponJson } from '@/lib/api/responses'
import { createCoupon, listCoupons } from '@/lib/services/coupons'

export const GET = handle(endpoints.listCoupons, async ({ actor, query }) => {
  const page = await listCoupons(actor, query)
  return ok({ data: page.items.map(couponJson), next_cursor: page.nextCursor })
})

export const POST = handle(endpoints.createCoupon, async ({ actor, body }) => {
  const coupon = await createCoupon(actor, body)
  return created(couponJson(coupon), `/api/v1/coupons/${coupon.id}`)
})
