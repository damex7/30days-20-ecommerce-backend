// PLACE ORDER, from the checkout page.
//
// 1. Places the order IDEMPOTENTLY: the hidden "key" field was made when the
//    page rendered, so a double tap, a back-button resubmit or a retry
//    after a dropped connection returns the SAME order instead of a second
//    one (exactly like the Idempotency-Key header on POST /api/v1/orders).
// 2. Asks Paystack for a checkout link (server to server, with our secret key).
// 3. Sends the customer to Paystack. They come back to /checkout/callback.
'use server'

import { redirect } from 'next/navigation'
import { fromServiceError } from '@/lib/action-helpers'
import { checkIdempotencyKey, placeOrderIdempotently } from '@/lib/api/place-order'
import { getRequestInfo } from '@/lib/auth/request'
import { isServiceError } from '@/lib/services/errors'
import { startPayment } from '@/lib/services/payments'
import { requirePageActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function placeOrder(_previous: FormState<'address_id'>, formData: FormData): Promise<FormState<'address_id'>> {
  const actor = await requirePageActor()
  const addressId = Number(field(formData, 'address_id'))
  if (!Number.isSafeInteger(addressId) || addressId < 1) {
    return { status: 'error', message: 'Choose a delivery address.', fieldErrors: { address_id: ['Choose where to deliver.'] }, submissionId: Date.now() }
  }

  let orderId: number
  try {
    const key = checkIdempotencyKey(field(formData, 'key'))
    const result = await placeOrderIdempotently(actor, { addressId }, key, await getRequestInfo())
    orderId = result.body.id
  } catch (error) {
    return fromServiceError(error)
  }

  let paystackUrl: string
  try {
    paystackUrl = (await startPayment(actor, orderId)).authorizationUrl
  } catch (error) {
    // The order exists and its stock is held; only the payment step failed
    // (Paystack unreachable, or not configured). Let them pay from the order page.
    if (isServiceError(error) && error.kind === 'unavailable') redirect(`/account/orders/${orderId}?notice=pay-later`)
    throw error
  }
  redirect(paystackUrl)
}
