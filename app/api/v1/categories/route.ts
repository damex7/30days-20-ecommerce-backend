// GET/POST /api/v1/categories
import { endpoints } from '@/lib/api/endpoints'
import { created, handle, ok } from '@/lib/api/handler'
import { categoryJson } from '@/lib/api/responses'
import { createCategory, listCategories } from '@/lib/services/catalog'

export const GET = handle(endpoints.listCategories, async () => ok({ data: (await listCategories()).map(categoryJson) }))

export const POST = handle(endpoints.createCategory, async ({ actor, body }) => {
  const category = await createCategory(actor, body)
  return created(categoryJson(category), `/api/v1/categories/${category.id}`)
})
