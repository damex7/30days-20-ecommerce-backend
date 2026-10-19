// SERVER ACTIONS for a signed-in user's own account and sessions.
//
// Each one starts with verifySession(). The page that showed the form
// checked the session too, but an action is a separate POST request that
// anyone can send, with any values, so it must check for itself.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { homePathFor, verifySession } from '@/lib/auth/dal'
import { breachedMessage, checkBreachedPassword, hashPassword, verifyPassword } from '@/lib/auth/password'
import { checkRateLimit, clearAccountRateLimit } from '@/lib/auth/rate-limit'
import { getRequestInfo } from '@/lib/auth/request'
import { clearSessionCookie, revokeOtherSessions, revokeSession, startSession } from '@/lib/auth/session'
import { changePassword, findUserWithHashById } from '@/lib/users'
import { fromServiceError } from '@/lib/action-helpers'
import { userActor } from '@/lib/services/actor'
import { authorize } from '@/lib/services/permissions'
import { updateProfile } from '@/lib/services/users'
import { changePasswordSchema, failed, field, invalid, profileSchema, sessionIdSchema, type FormState } from '@/lib/validation'

const now = () => Date.now()

export async function updateProfileAction(_previous: FormState<'name' | 'phone'>, formData: FormData): Promise<FormState<'name' | 'phone'>> {
  const { user } = await verifySession()
  const values = { name: field(formData, 'name'), phone: field(formData, 'phone') }
  const parsed = profileSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  // Through the service: demo staff/admin are read-only (lib/services/permissions.ts).
  try {
    await updateProfile(userActor(user), parsed.data, await getRequestInfo())
  } catch (error) {
    return fromServiceError(error, values)
  }
  // The name also shows in the header: re-render the page around the form.
  refresh()
  return { status: 'success', message: 'Your details were saved.', values: { name: parsed.data.name, phone: parsed.data.phone ?? '' }, submissionId: now() }
}

/**
 * Asking for the CURRENT password means someone who finds your laptop
 * unlocked (or steals your session cookie) can't lock you out by changing
 * it. Guesses at it are rate-limited like logins.
 */
async function checkCurrentPassword(userId: string, email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const request = await getRequestInfo()
  const limit = await checkRateLimit('login', request.ip, email)
  if (!limit.ok) return { ok: false, message: limit.message }
  const found = await findUserWithHashById(userId)
  const ok = await verifyPassword(found?.passwordHash ?? null, password)
  if (!ok) return { ok: false, message: 'That isn’t your current password.' }
  await clearAccountRateLimit('login', email)
  return { ok: true }
}

type PasswordField = 'currentPassword' | 'newPassword'

/**
 * Changes the password, then:
 * - signs out EVERY OTHER session (if someone else knew the old password
 *   and was signed in, they're out);
 * - gives this browser a NEW session token (rotation), so a token that
 *   might have been copied before the change stops working too.
 *
 * Day 18: for a TEMPORARY password (an admin-created account), the
 * "current password" is the one the admin handed over. Once it's replaced,
 * must_change_password is cleared and the person goes on to their own home page.
 */
export async function changePasswordAction(_previous: FormState<PasswordField>, formData: FormData): Promise<FormState<PasswordField>> {
  const { user, session } = await verifySession()
  // Demo accounts have no password to change (and can't set one).
  try {
    authorize(userActor(user), 'account.credentials')
  } catch (error) {
    return fromServiceError(error)
  }
  const parsed = changePasswordSchema.safeParse({ currentPassword: field(formData, 'currentPassword'), newPassword: field(formData, 'newPassword') })
  if (!parsed.success) return invalid(parsed.error, {})
  const { currentPassword, newPassword } = parsed.data

  const current = await checkCurrentPassword(user.id, user.email, currentPassword)
  if (!current.ok) {
    return { status: 'error', message: 'Your password wasn’t changed.', fieldErrors: { currentPassword: [current.message] }, submissionId: now() }
  }
  if (newPassword === currentPassword) {
    return { status: 'error', message: 'Your password wasn’t changed.', fieldErrors: { newPassword: ['Choose a password different from your current one.'] }, submissionId: now() }
  }
  const breach = await checkBreachedPassword(newPassword)
  if (breach.breached) {
    return { status: 'error', message: 'Please choose a different password.', fieldErrors: { newPassword: [breachedMessage(breach.count)] }, submissionId: now() }
  }

  const request = await getRequestInfo()
  await changePassword(user.id, await hashPassword(newPassword), session.id, request)
  await startSession(user.id, request)
  if (user.mustChangePassword) redirect(`${homePathFor(user.role)}?notice=password-set`)
  return { status: 'success', message: 'Password changed. Every other device was signed out, and this one has a fresh session.', submissionId: now() }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/*
  Both session actions redirect back to the list with a notice, rather than
  returning a message: the revoked session's card (where the button was)
  disappears from the re-rendered list, and its message would vanish with it.
*/

/** Signs out one session. Revoking the current one is just signing out. */
export async function revokeSessionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user, session } = await verifySession()
  const parsed = sessionIdSchema.safeParse({ sessionId: field(formData, 'sessionId') })
  if (!parsed.success) return failed('That session couldn’t be found.')

  const request = await getRequestInfo()
  const revoked = await revokeSession(user.id, parsed.data.sessionId, request)
  if (parsed.data.sessionId === session.id) {
    await clearSessionCookie()
    redirect('/login?notice=signed-out')
  }
  redirect(`/account/sessions?notice=${revoked ? 'revoked' : 'gone'}`)
}

export async function revokeOtherSessionsAction(_previous: FormState, _formData: FormData): Promise<FormState> {
  const { user, session } = await verifySession()
  const count = await revokeOtherSessions(user.id, session.id, await getRequestInfo())
  redirect(`/account/sessions?notice=others&count=${count}`)
}
