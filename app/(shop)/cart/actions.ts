// THE CART PAGE'S ACTIONS: thin wrappers over lib/services/cart.ts, the
// same functions PATCH/DELETE /api/v1/cart/items and PUT /api/v1/cart/coupon call.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError, readId } from '@/lib/action-helpers'
import { applyCouponBody, updateCartItemBody } from '@/lib/api/requests'
import { formatNaira } from '@/lib/money'
import { applyCoupon, removeCoupon, removeItem, updateItem } from '@/lib/services/cart'
import { requirePageActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function changeQuantity(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That item is no longer in your cart.', submissionId: Date.now() }
  const parsed = updateCartItemBody.safeParse({ quantity: Number(field(formData, 'quantity')) })
  if (!parsed.success) return fromZodError(parsed.error)
  try {
    const cart = await updateItem(actor, id, parsed.data.quantity)
    const line = cart.lines.find((l) => l.itemId === id)
    refresh()
    return { status: 'success', message: line ? `${line.productName}: quantity is now ${line.quantity}.` : 'Quantity updated.', submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}

export async function removeFromCart(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That item is no longer in your cart.', submissionId: Date.now() }
  try {
    await removeItem(actor, id)
    refresh()
    return { status: 'success', message: `Removed ${field(formData, 'name') || 'the item'} from your cart.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}

type CouponField = 'code'

export async function applyCode(_previous: FormState<CouponField>, formData: FormData): Promise<FormState<CouponField>> {
  const actor = await requirePageActor()
  const values = { code: field(formData, 'code') }
  const parsed = applyCouponBody.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    const cart = await applyCoupon(actor, parsed.data.code)
    refresh()
    return { status: 'success', message: `${cart.coupon?.code ?? 'The code'} applied: you save ${formatNaira(cart.discountKobo)}.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error, values)
  }
}

export async function removeCode(_previous: FormState, _formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  try {
    await removeCoupon(actor)
    refresh()
    return { status: 'success', message: 'Code removed.', submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}
