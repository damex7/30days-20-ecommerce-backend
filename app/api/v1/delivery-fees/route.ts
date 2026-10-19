// GET /api/v1/delivery-fees
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { deliveryFeeJson } from '@/lib/api/responses'
import { listDeliveryFees } from '@/lib/services/addresses'

export const GET = handle(endpoints.listDeliveryFees, async () => ok({ data: (await listDeliveryFees()).map(deliveryFeeJson) }))
