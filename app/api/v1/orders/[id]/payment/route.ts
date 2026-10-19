// POST /api/v1/orders/{id}/payment: Paystack's checkout link for this order.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { startPayment } from '@/lib/services/payments'

export const POST = handle(endpoints.startPayment, async ({ actor, params }) => {
  const started = await startPayment(actor, params.id)
  return ok({ authorization_url: started.authorizationUrl, reference: started.reference })
})
