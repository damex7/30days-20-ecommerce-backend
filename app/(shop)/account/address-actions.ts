// ADDRESS BOOK ACTIONS (used on /account and /checkout). The form fields
// are named like the API's JSON (recipient_name, is_default…), so ONE Zod
// schema (createAddressBody / updateAddressBody) validates both, and a
// service's field errors land under the right input.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fromServiceError, fromZodError, readId } from '@/lib/action-helpers'
import { createAddressBody, updateAddressBody } from '@/lib/api/requests'
import { createAddress, deleteAddress, updateAddress } from '@/lib/services/addresses'
import { requirePageActor } from '@/lib/services/session-actor'
import { safeNextPath } from '@/lib/safe-redirect'
import { field, type FormState } from '@/lib/validation'

const ADDRESS_FIELDS = ['label', 'recipient_name', 'phone', 'street', 'city', 'state', 'landmark'] as const
export type AddressField = (typeof ADDRESS_FIELDS)[number] | 'is_default'

function readAddress(formData: FormData) {
  const values = Object.fromEntries(ADDRESS_FIELDS.map((name) => [name, field(formData, name)])) as Record<(typeof ADDRESS_FIELDS)[number], string>
  return { values, body: { ...values, label: values.label || null, landmark: values.landmark || null, is_default: field(formData, 'is_default') === 'on' } }
}

/** Create, or update when an id is sent. On success from checkout, go back there with the new address chosen. */
export async function saveAddress(_previous: FormState<AddressField>, formData: FormData): Promise<FormState<AddressField>> {
  const actor = await requirePageActor()
  const { values, body } = readAddress(formData)
  const id = readId(formData)
  const after = field(formData, 'after')

  let savedId: number
  try {
    if (id) {
      const parsed = updateAddressBody.safeParse({ ...body, version: Number(field(formData, 'version')) })
      if (!parsed.success) return fromZodError(parsed.error, values)
      savedId = (await updateAddress(actor, id, parsed.data.version, parsed.data.patch)).id
    } else {
      const parsed = createAddressBody.safeParse(body)
      if (!parsed.success) return fromZodError(parsed.error, values)
      savedId = (await createAddress(actor, parsed.data)).id
    }
  } catch (error) {
    return fromServiceError(error, values)
  }
  if (after === 'checkout') redirect(`/checkout?address=${savedId}`)
  refresh()
  return { status: 'success', message: id ? 'Address updated.' : 'Address saved.', submissionId: Date.now() }
}

export async function removeAddress(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That address no longer exists.', submissionId: Date.now() }
  try {
    await deleteAddress(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return { status: 'success', message: 'Address deleted.', submissionId: Date.now() }
}

export async function makeDefault(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That address no longer exists.', submissionId: Date.now() }
  try {
    await updateAddress(actor, id, Number(field(formData, 'version')), { isDefault: true })
  } catch (error) {
    return fromServiceError(error)
  }
  redirect(safeNextPath(field(formData, 'back'), '/account'))
}
