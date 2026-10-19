// ADMIN DELIVERY FEES: the same service as PATCH /api/v1/delivery-fees/{state}.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError } from '@/lib/action-helpers'
import { updateDeliveryFeeBody } from '@/lib/api/requests'
import { parseNaira } from '@/lib/money'
import { updateDeliveryFee } from '@/lib/services/addresses'
import { requireAdminActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function saveFee(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const state = field(formData, 'state')
  const fee = parseNaira(field(formData, 'fee'))
  if (fee === null) return { status: 'error', message: `${state}: enter the fee in Naira, like 3500.`, submissionId: Date.now() }
  const parsed = updateDeliveryFeeBody.safeParse({
    fee_kobo: fee,
    min_days: Number(field(formData, 'min_days')),
    max_days: Number(field(formData, 'max_days')),
    version: Number(field(formData, 'version')),
  })
  if (!parsed.success) return { ...fromZodError(parsed.error), message: `${state}: use whole days from 1 to 30.` }
  try {
    await updateDeliveryFee(actor, state, parsed.data.version, parsed.data.patch)
  } catch (error) {
    const s = fromServiceError(error)
    return { ...s, message: `${state}: ${s.message}` }
  }
  refresh()
  return { status: 'success', message: `${state} saved.`, submissionId: Date.now() }
}
