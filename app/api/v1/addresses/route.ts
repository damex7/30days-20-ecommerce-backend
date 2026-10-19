// GET/POST /api/v1/addresses
import { endpoints } from '@/lib/api/endpoints'
import { created, handle, ok } from '@/lib/api/handler'
import { addressJson } from '@/lib/api/responses'
import { createAddress, listAddresses } from '@/lib/services/addresses'

export const GET = handle(endpoints.listAddresses, async ({ actor }) => ok({ data: (await listAddresses(actor)).map(addressJson) }))

export const POST = handle(endpoints.createAddress, async ({ actor, body }) => {
  const address = await createAddress(actor, body)
  return created(addressJson(address), `/api/v1/addresses/${address.id}`)
})
