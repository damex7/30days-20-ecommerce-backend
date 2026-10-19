// GET/PATCH/DELETE /api/v1/addresses/{id}: someone else's address is 404.
import { endpoints } from '@/lib/api/endpoints'
import { handle, noContent, ok } from '@/lib/api/handler'
import { addressJson } from '@/lib/api/responses'
import { deleteAddress, getAddress, updateAddress } from '@/lib/services/addresses'

export const GET = handle(endpoints.getAddress, async ({ actor, params }) => ok(addressJson(await getAddress(actor, params.id))))

export const PATCH = handle(endpoints.updateAddress, async ({ actor, params, body }) => ok(addressJson(await updateAddress(actor, params.id, body.version, body.patch))))

export const DELETE = handle(endpoints.deleteAddress, async ({ actor, params }) => {
  await deleteAddress(actor, params.id)
  return noContent()
})
