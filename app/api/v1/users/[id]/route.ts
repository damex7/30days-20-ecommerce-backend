// PATCH /api/v1/users/{id} (admin)
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { adminUserJson } from '@/lib/api/responses'
import { changeUser } from '@/lib/services/users'

export const PATCH = handle(endpoints.updateUser, async ({ actor, params, body, info }) => ok(adminUserJson(await changeUser(actor, params.id, body, info))))
