// GET /api/v1/orders/{id}/events
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { orderEventJson } from '@/lib/api/responses'
import { getOrderEvents } from '@/lib/services/orders'

export const GET = handle(endpoints.listOrderEvents, async ({ actor, params }) => ok({ data: (await getOrderEvents(actor, params.id)).map(orderEventJson) }))
