// PATCH /api/v1/categories/{id}
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { categoryJson } from '@/lib/api/responses'
import { updateCategory } from '@/lib/services/catalog'

export const PATCH = handle(endpoints.updateCategory, async ({ actor, params, body: { version, ...patch } }) =>
  ok(categoryJson(await updateCategory(actor, params.id, version, patch))),
)
