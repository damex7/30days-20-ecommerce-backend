// POST /api/v1/auth/logout: deletes this session's row and its cookie.
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent } from '@/lib/api/handler'
import { endCurrentSession } from '@/lib/auth/session'
import { forbidden } from '@/lib/services/errors'

export const POST = handle(endpoints.logout, async ({ actor, info }) => {
  if (actor.kind !== 'user') throw forbidden('session_required', 'API keys don’t have a session to end. Revoke the key instead.')
  await endCurrentSession(info)
  return noContent()
})
