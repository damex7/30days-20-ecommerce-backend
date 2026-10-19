// PATCH /api/v1/delivery-fees/{state}
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { deliveryFeeJson } from '@/lib/api/responses'
import { updateDeliveryFee } from '@/lib/services/addresses'

export const PATCH = handle(endpoints.updateDeliveryFee, async ({ actor, params, body }) =>
  ok(deliveryFeeJson(await updateDeliveryFee(actor, params.state, body.version, body.patch))),
)
