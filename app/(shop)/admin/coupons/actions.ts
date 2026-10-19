// ADMIN COUPON ACTIONS: the same services and schemas as /api/v1/coupons.
// Money in Naira on the page, kobo in the schema; dates as Lagos dates.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError, readId } from '@/lib/action-helpers'
import { createCouponBody, updateCouponBody } from '@/lib/api/requests'
import { parseNaira } from '@/lib/money'
import { createCoupon, updateCoupon } from '@/lib/services/coupons'
import { requireAdminActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

const FIELDS = ['code', 'description', 'kind', 'value', 'min_order', 'max_uses', 'per_customer_limit', 'starts_on', 'ends_on'] as const
export type CouponField = (typeof FIELDS)[number] | 'min_order_kobo' | 'starts_at' | 'ends_at'

/** A date input ("2026-11-01") as the start or end of that day in Lagos, in ISO form. */
const lagos = (date: string, end: boolean) => (date ? `${date}T${end ? '23:59:59' : '00:00:00'}+01:00` : null)

export async function createCouponAction(_previous: FormState<CouponField>, formData: FormData): Promise<FormState<CouponField>> {
  const actor = await requireAdminActor()
  const values = Object.fromEntries(FIELDS.map((n) => [n, field(formData, n)])) as Record<(typeof FIELDS)[number], string>
  const minOrder = values.min_order ? parseNaira(values.min_order) : 0
  if (minOrder === null) return { status: 'error', message: 'Please fix the problems below.', fieldErrors: { min_order: ['Enter an amount in Naira'] }, values, submissionId: Date.now() }
  // A fixed coupon's value is typed in Naira too; a percentage is a whole number.
  const value = values.kind === 'fixed' ? parseNaira(values.value) : Number(values.value)
  if (value === null || !Number.isFinite(value)) return { status: 'error', message: 'Please fix the problems below.', fieldErrors: { value: ['Enter a number'] }, values, submissionId: Date.now() }
  const parsed = createCouponBody.safeParse({
    code: values.code,
    description: values.description,
    kind: values.kind,
    value,
    min_order_kobo: minOrder,
    max_uses: values.max_uses ? Number(values.max_uses) : null,
    per_customer_limit: values.per_customer_limit ? Number(values.per_customer_limit) : null,
    starts_at: lagos(values.starts_on, false),
    ends_at: lagos(values.ends_on, true),
    active: true,
  })
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    const coupon = await createCoupon(actor, parsed.data)
    refresh()
    return { status: 'success', message: `Coupon ${coupon.code} created.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error, values)
  }
}

/** Pause or resume a coupon (the commonest edit). Full edits go through PATCH /api/v1/coupons/{id}. */
export async function toggleCoupon(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That coupon no longer exists.', submissionId: Date.now() }
  const parsed = updateCouponBody.safeParse({ active: field(formData, 'active') === 'true', version: Number(field(formData, 'version')) })
  if (!parsed.success) return fromZodError(parsed.error)
  try {
    const coupon = await updateCoupon(actor, id, parsed.data.version, parsed.data.patch)
    refresh()
    return { status: 'success', message: `${coupon.code} is ${coupon.active ? 'active again' : 'paused'}.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}
