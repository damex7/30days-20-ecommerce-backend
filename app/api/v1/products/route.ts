// GET/POST /api/v1/products
import { endpoints } from '@/lib/api/endpoints'
import { created, handle, ok } from '@/lib/api/handler'
import { productDetailJson, productSummaryJson } from '@/lib/api/responses'
import { createProduct, listProducts } from '@/lib/services/catalog'

export const GET = handle(endpoints.listProducts, async ({ actor, query }) => {
  const page = await listProducts(actor, query)
  return ok({ data: page.items.map(productSummaryJson), next_cursor: page.nextCursor })
})

export const POST = handle(endpoints.createProduct, async ({ actor, body }) => {
  const product = await createProduct(actor, body)
  return created(productDetailJson(product), `/api/v1/products/${product.slug}`)
})
