// GET /api/v1/payment-events (admin): the webhook log.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { paymentEventJson } from '@/lib/api/responses'
import { listPaymentEvents } from '@/lib/services/payments'

export const GET = handle(endpoints.listPaymentEvents, async ({ actor, query }) => {
  const page = await listPaymentEvents(actor, query)
  return ok({ data: page.items.map(paymentEventJson), next_cursor: page.nextCursor })
})
