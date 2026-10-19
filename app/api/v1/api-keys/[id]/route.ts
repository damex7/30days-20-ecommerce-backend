// DELETE /api/v1/api-keys/{id}: revokes (the row stays for the history).
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent } from '@/lib/api/handler'
import { revokeApiKey } from '@/lib/services/api-keys'

export const DELETE = handle(endpoints.revokeApiKey, async ({ actor, params }) => {
  await revokeApiKey(actor, params.id)
  return noContent()
})
