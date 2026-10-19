// POST /api/v1/products/{id}/variants
import { endpoints } from '@/lib/api/endpoints'
import { created, handle } from '@/lib/api/handler'
import { variantJson } from '@/lib/api/responses'
import { createVariant } from '@/lib/services/catalog'

export const POST = handle(endpoints.createVariant, async ({ actor, params, body }) => {
  const variant = await createVariant(actor, params.ref, body)
  return created(variantJson(variant), `/api/v1/variants/${variant.id}`)
})
