// GET /api/v1/products/{slug} · PATCH/DELETE /api/v1/products/{id}
// (one folder, [ref]: see lib/api/endpoints.ts)
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent, ok } from '@/lib/api/handler'
import { productDetailJson } from '@/lib/api/responses'
import { deleteProduct, getProductBySlug, updateProduct } from '@/lib/services/catalog'

export const GET = handle(endpoints.getProduct, async ({ actor, params }) => ok(productDetailJson(await getProductBySlug(actor, params.ref))))

export const PATCH = handle(endpoints.updateProduct, async ({ actor, params, body }) =>
  ok(productDetailJson(await updateProduct(actor, params.ref, body.version, body.patch))),
)

export const DELETE = handle(endpoints.deleteProduct, async ({ actor, params }) => {
  await deleteProduct(actor, params.ref)
  return noContent()
})
