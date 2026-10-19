// POST /api/v1/orders/{id}/notes
import { endpoints } from '@/lib/api/endpoints'
import { created, handle } from '@/lib/api/handler'
import { orderEventJson } from '@/lib/api/responses'
import { addNote } from '@/lib/services/orders'

export const POST = handle(endpoints.addOrderNote, async ({ actor, params, body }) =>
  created({ data: (await addNote(actor, params.id, body.note)).map(orderEventJson) }, `/api/v1/orders/${params.id}/events`),
)
