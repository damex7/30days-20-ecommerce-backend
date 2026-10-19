// PATCH/DELETE /api/v1/variants/{id}
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent, ok } from '@/lib/api/handler'
import { variantJson } from '@/lib/api/responses'
import { deleteVariant, updateVariant } from '@/lib/services/catalog'

export const PATCH = handle(endpoints.updateVariant, async ({ actor, params, body }) => ok(variantJson(await updateVariant(actor, params.id, body.version, body.patch))))

export const DELETE = handle(endpoints.deleteVariant, async ({ actor, params }) => {
  await deleteVariant(actor, params.id)
  return noContent()
})
