// PATCH /api/v1/coupons/{id} (admin)
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { couponJson } from '@/lib/api/responses'
import { updateCoupon } from '@/lib/services/coupons'

export const PATCH = handle(endpoints.updateCoupon, async ({ actor, params, body }) => ok(couponJson(await updateCoupon(actor, params.id, body.version, body.patch))))
