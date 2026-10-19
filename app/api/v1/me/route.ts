// GET/PATCH /api/v1/me
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { meKeyJson, meUserJson } from '@/lib/api/responses'
import { getProfile, updateProfile } from '@/lib/services/users'

export const GET = handle(endpoints.getMe, async ({ actor }) => ok(actor.kind === 'api_key' ? meKeyJson(actor.key) : meUserJson(getProfile(actor))))

export const PATCH = handle(endpoints.updateMe, async ({ actor, body, info }) => ok(meUserJson(await updateProfile(actor, body, info))))
