// POST /api/v1/auth/signup: always 202 with the same message (no account enumeration).
import { endpoints } from '@/lib/api/endpoints'
import { handle } from '@/lib/api/handler'
import { signUp, SIGNUP_ACCEPTED } from '@/lib/services/auth'

export const POST = handle(endpoints.signup, async ({ body, info }) => {
  await signUp(body, info)
  return { status: 202, body: { message: SIGNUP_ACCEPTED } }
})
