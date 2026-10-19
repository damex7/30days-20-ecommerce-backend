// POST /api/webhooks/paystack: Paystack tells us a payment happened.
//
// ORDER OF WORK MATTERS:
//   1. read the RAW body as text (the signature covers these exact bytes);
//   2. check x-paystack-signature (HMAC-SHA512, constant-time compare)
//      BEFORE parsing or trusting anything in it; a bad one is 401;
//   3. only then parse it and hand it to the payments service, which
//      records the event id (so a repeat is ignored), checks the amount and
//      currency against the order, and marks it paid.
//
// Answering: 200 once handled (or already handled: Paystack then stops
// retrying). 503 if our database is down, so Paystack RETRIES later
// instead of the payment being lost.
//
// Local development: Paystack can't reach localhost, so this route only
// runs once deployed. Locally the callback page's verify does the work.
import { z } from 'zod'
import { problemResponse } from '@/lib/api/problem'
import { requestIdFrom, toProblem } from '@/lib/api/handler'
import { verifySignature } from '@/lib/paystack'
import { handleWebhookEvent } from '@/lib/services/payments'

const Envelope = z.object({ event: z.string().min(1).max(60), data: z.unknown() })

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request)
  const raw = await request.text()

  if (!verifySignature(raw, request.headers.get('x-paystack-signature'))) {
    console.warn(`[webhook] ${requestId} refused: bad or missing x-paystack-signature`)
    return problemResponse({ status: 401, code: 'bad_signature', detail: 'The x-paystack-signature header does not match this body.' }, requestId)
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return problemResponse({ status: 400, code: 'invalid_json', detail: 'The body is not valid JSON.' }, requestId)
  }
  const envelope = Envelope.safeParse(payload)
  if (!envelope.success) return problemResponse({ status: 400, code: 'invalid_event', detail: 'Expected { event, data }.' }, requestId)

  try {
    const result = await handleWebhookEvent(envelope.data, payload)
    console.log(`[webhook] ${requestId} ${envelope.data.event} → ${result.outcome}${result.orderId ? ` (order ${result.orderId})` : ''}`)
    return Response.json({ received: true, outcome: result.outcome }, { headers: { 'X-Request-Id': requestId } })
  } catch (error) {
    return problemResponse(toProblem(error, requestId), requestId)
  }
}
