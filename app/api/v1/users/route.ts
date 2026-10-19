// GET /api/v1/users (admin)
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { adminUserJson } from '@/lib/api/responses'
import { listUsers } from '@/lib/services/users'

export const GET = handle(endpoints.listUsers, async ({ actor, query }) => {
  const page = await listUsers(actor, query)
  return ok({ data: page.items.map(adminUserJson), next_cursor: page.nextCursor })
})
