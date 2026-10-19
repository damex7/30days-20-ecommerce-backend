// ADMIN API KEYS: create (the secret comes back ONCE), revoke. The same
// services as POST/DELETE /api/v1/api-keys. Demo admins are refused.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError } from '@/lib/action-helpers'
import { createApiKeyBody } from '@/lib/api/requests'
import { createApiKey, revokeApiKey } from '@/lib/services/api-keys'
import { requireAdminActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

type KeyField = 'name' | 'scopes' | 'expires_on' | 'expires_at' | 'secret'

export async function createKeyAction(_previous: FormState<KeyField>, formData: FormData): Promise<FormState<KeyField>> {
  const actor = await requireAdminActor()
  const values = { name: field(formData, 'name'), expires_on: field(formData, 'expires_on') }
  const scopes = formData.getAll('scopes').filter((s): s is string => typeof s === 'string')
  const parsed = createApiKeyBody.safeParse({
    name: values.name,
    scopes,
    expires_at: values.expires_on ? `${values.expires_on}T23:59:59+01:00` : null,
  })
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    const { key, secret } = await createApiKey(actor, parsed.data)
    refresh()
    // The ONLY time the secret leaves the server. It isn't stored anywhere.
    return { status: 'success', message: `Key “${key.name}” created. Copy it now: it won’t be shown again.`, values: { secret }, submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error, values)
  }
}

export async function revokeKeyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  try {
    await revokeApiKey(actor, field(formData, 'id'))
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return { status: 'success', message: 'Key revoked. Requests with it now get 401.', submissionId: Date.now() }
}
