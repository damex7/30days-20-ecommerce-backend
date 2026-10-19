// A CUSTOMER'S OWN ORDER: pay (again) or cancel while unpaid. The same
// services as POST /api/v1/orders/{id}/payment and /transitions, so the
// state machine and the ownership check are exactly the API's.
'use server'

import { redirect } from 'next/navigation'
import { fromServiceError, readId } from '@/lib/action-helpers'
import { transitionOrder } from '@/lib/services/orders'
import { startPayment } from '@/lib/services/payments'
import { requirePageActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function payOrder(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That order couldn’t be found.', submissionId: Date.now() }
  let url: string
  try {
    url = (await startPayment(actor, id)).authorizationUrl
  } catch (error) {
    return fromServiceError(error)
  }
  redirect(url)
}

export async function cancelOrder(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That order couldn’t be found.', submissionId: Date.now() }
  try {
    await transitionOrder(actor, id, { to: 'cancelled', version: Number(field(formData, 'version')), note: 'Cancelled by the customer before paying.' })
  } catch (error) {
    return fromServiceError(error)
  }
  redirect(`/account/orders/${id}?notice=cancelled`)
}
