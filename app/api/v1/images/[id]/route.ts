// DELETE /api/v1/images/{id}
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent } from '@/lib/api/handler'
import { deleteImage } from '@/lib/services/catalog'

export const DELETE = handle(endpoints.deleteImage, async ({ actor, params }) => {
  await deleteImage(actor, params.id)
  return noContent()
})
