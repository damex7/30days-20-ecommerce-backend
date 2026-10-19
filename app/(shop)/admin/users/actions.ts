// ADMIN USER ACTIONS: role changes, (de)activation, new staff accounts.
// The same services as PATCH /api/v1/users/{id}; the SQL itself refuses
// changing your own account or a demo account.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError } from '@/lib/action-helpers'
import { createStaffBody, updateUserBody } from '@/lib/api/requests'
import { getRequestInfo } from '@/lib/auth/request'
import { changeUser, createStaff } from '@/lib/services/users'
import { requireAdminActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function changeUserAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const id = field(formData, 'id')
  const active = field(formData, 'active')
  const parsed = updateUserBody.safeParse({ role: field(formData, 'role') || undefined, active: active === '' ? undefined : active === 'true' })
  if (!parsed.success) return fromZodError(parsed.error)
  try {
    const user = await changeUser(actor, id, parsed.data, await getRequestInfo())
    refresh()
    return { status: 'success', message: `${user.name}: ${user.role}, ${user.deactivatedAt ? 'deactivated' : 'active'}.`, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
}

type StaffField = 'name' | 'email' | 'role'

/** Returns the temporary password ONCE, in the success message's values. */
export async function createStaffAction(_previous: FormState<StaffField | 'password'>, formData: FormData): Promise<FormState<StaffField | 'password'>> {
  const actor = await requireAdminActor()
  const values = { name: field(formData, 'name'), email: field(formData, 'email'), role: field(formData, 'role') }
  const parsed = createStaffBody.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    const { temporaryPassword } = await createStaff(actor, parsed.data, await getRequestInfo())
    refresh()
    return { status: 'success', message: `${parsed.data.name} can now sign in with this temporary password. It is shown only once.`, values: { password: temporaryPassword, email: parsed.data.email }, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error, values)
  }
}
