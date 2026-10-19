// STAFF ORDER ACTIONS: move an order along the state machine, add a note.
// The same services as POST /api/v1/orders/{id}/transitions and /notes, so
// only the moves in lib/services/order-status.ts are possible, a stale
// version is refused, and demo staff are refused (read-only).
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError, readId } from '@/lib/action-helpers'
import { noteBody, transitionBody } from '@/lib/api/requests'
import { statusLabel } from '@/lib/services/order-status'
import { addNote, transitionOrder } from '@/lib/services/orders'
import { requireShopActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function moveOrder(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireShopActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That order couldn’t be found.', submissionId: Date.now() }
  const parsed = transitionBody.safeParse({ to: field(formData, 'to'), note: field(formData, 'note') || null, version: Number(field(formData, 'version')) })
  if (!parsed.success) return fromZodError(parsed.error)
  try {
    const order = await transitionOrder(actor, id, parsed.data)
    refresh()
    return { status: 'success', message: `Order ${order.number} is now ${statusLabel(order.status)}.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}

export async function addNoteAction(_previous: FormState<'note'>, formData: FormData): Promise<FormState<'note'>> {
  const actor = await requireShopActor()
  const id = readId(formData)
  const values = { note: field(formData, 'note') }
  if (!id) return { status: 'error', message: 'That order couldn’t be found.', submissionId: Date.now() }
  const parsed = noteBody.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await addNote(actor, id, parsed.data.note)
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return { status: 'success', message: 'Note added to the history.', submissionId: Date.now() }
}
