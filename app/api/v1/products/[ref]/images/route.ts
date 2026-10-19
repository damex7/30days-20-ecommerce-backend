// POST /api/v1/products/{id}/images
import { endpoints } from '@/lib/api/endpoints'
import { created, handle } from '@/lib/api/handler'
import { imageJson } from '@/lib/api/responses'
import { addImage } from '@/lib/services/catalog'

export const POST = handle(endpoints.createImage, async ({ actor, params, body }) => {
  const image = await addImage(actor, params.ref, body)
  return created(imageJson(image), `/api/v1/images/${image.id}`)
})
