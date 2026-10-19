// POST /api/v1/auth/login: the same sign-in as the login page, for apps.
// The answer sets the HttpOnly session cookie; send it back on later calls.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { meUserJson } from '@/lib/api/responses'
import { signIn } from '@/lib/services/auth'

export const POST = handle(endpoints.login, async ({ body, info }) => ok(meUserJson(await signIn(body, info))))
