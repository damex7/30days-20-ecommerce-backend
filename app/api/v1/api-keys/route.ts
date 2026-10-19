// GET/POST /api/v1/api-keys (admin). The secret appears in the 201 response ONLY.
import { endpoints } from '@/lib/api/endpoints'
import { created, handle, ok } from '@/lib/api/handler'
import { apiKeyJson } from '@/lib/api/responses'
import { createApiKey, listApiKeys } from '@/lib/services/api-keys'

export const GET = handle(endpoints.listApiKeys, async ({ actor }) => ok({ data: (await listApiKeys(actor)).map(apiKeyJson) }))

export const POST = handle(endpoints.createApiKey, async ({ actor, body }) => {
  const { key, secret } = await createApiKey(actor, body)
  return created({ ...apiKeyJson(key), secret }, `/api/v1/api-keys/${key.id}`)
})
