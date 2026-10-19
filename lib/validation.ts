// INPUT RULES. Every value that arrives from a form passes through one of
// these Zod schemas before it touches the database. Types come from
// z.infer, so the rules and the TypeScript types can't drift apart.
//
// Not server-only: the limits are also used by the forms (maxLength,
// minLength) and the password strength hint in the browser. The browser's
// checks are only a convenience; the server always checks again here.
import { z } from 'zod'
import { normalizeNigerianPhone } from '@/lib/phone'

export const PASSWORD_MIN = 8
// An upper limit matters for a password field: argon2 hashes whatever it is
// given, and a 10 MB "password" would tie up the server. 128 is far more
// than any passphrase needs.
export const PASSWORD_MAX = 128
export const NAME_MAX = 100
export const PHONE_MAX = 30
export const EMAIL_MAX = 254

const email = z
  .string({ error: 'Enter your email address' })
  .trim()
  .min(1, 'Enter your email address')
  .max(EMAIL_MAX, 'That email address is too long')
  .pipe(z.email('Enter an email address like ada@example.com'))

/** Reused by the admin forms. */
export const emailSchema = email

const name = z
  .string({ error: 'Enter your name' })
  .trim()
  .min(1, 'Enter your name')
  .max(NAME_MAX, `Use ${NAME_MAX} characters or fewer`)

/** A password being CHOSEN: the length policy applies. Never trimmed: spaces are allowed and count. */
const newPassword = z
  .string({ error: 'Choose a password' })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer`)

/**
 * A password being CHECKED (login, "current password"): only "not empty"
 * and the hard upper limit. Applying the length policy here would turn a
 * wrong password into a different error message for no benefit.
 */
const existingPassword = z
  .string({ error: 'Enter your password' })
  .min(1, 'Enter your password')
  .max(PASSWORD_MAX, 'Email or password is incorrect')

/** A raw token from an email link: 32 random bytes as base64url = 43 characters. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/**
 * An optional Nigerian mobile number: empty means "not given"; anything
 * else must be a number lib/phone.ts recognises, and comes out in +234 form.
 */
export const optionalPhone = z
  .string()
  .trim()
  .max(PHONE_MAX, 'That number is too long')
  .transform((value, ctx) => {
    if (value === '') return null
    const normalised = normalizeNigerianPhone(value)
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number like 0803 123 4567' })
      return z.NEVER
    }
    return normalised
  })

export const signUpSchema = z.object({ name, email, phone: optionalPhone, password: newPassword })
export type SignUpInput = z.infer<typeof signUpSchema>

export const loginSchema = z.object({ email, password: existingPassword })
export type LoginInput = z.infer<typeof loginSchema>

export const emailOnlySchema = z.object({ email })
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>

export const resetPasswordSchema = z.object({ token: tokenSchema, password: newPassword })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const verifyEmailSchema = z.object({ token: tokenSchema })

export const profileSchema = z.object({ name, phone: optionalPhone })
export type ProfileInput = z.infer<typeof profileSchema>

export const changePasswordSchema = z.object({
  currentPassword: existingPassword,
  newPassword,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** Session ids are SHA-256 hashes in hex (see db/migrations/002). */
export const sessionIdSchema = z.object({ sessionId: z.string().regex(/^[0-9a-f]{64}$/) })

export const userIdSchema = z.object({ userId: z.uuid() })

// Day 20: three roles (db/migrations/006_roles_and_demo.sql).
export const ROLES = ['customer', 'staff', 'admin'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

/** Admins move people between all three roles on /admin/users. */
export const changeRoleSchema = z.object({ userId: z.uuid(), role: roleSchema })


export const setActiveSchema = z.object({ userId: z.uuid(), active: z.enum(['true', 'false']).transform((v) => v === 'true') })

/** /admin?q=…&page=… : bad values fall back to defaults instead of erroring. */
export const adminSearchSchema = z.object({
  q: z.string().trim().max(100).catch(''),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

/**
 * What every form's Server Action returns to useActionState.
 * - fieldErrors: messages shown under each field (linked with aria-describedby)
 * - values: what was typed, sent back so the form keeps it after an error.
 *   Passwords are NEVER sent back.
 * - submissionId: changes on every submit, so the error summary takes focus
 *   again even when the message is the same as last time.
 */
export type FormState<Field extends string = string> = {
  status: 'idle' | 'error' | 'success'
  message?: string
  fieldErrors?: Partial<Record<Field, string[]>>
  values?: Partial<Record<Field, string>>
  submissionId?: number
  /** Day 18: a delete refused because of history; the dialog offers "Archive instead". */
  offerArchive?: boolean
}

export const initialFormState: FormState = { status: 'idle' }

/** Turns a failed Zod parse into the FormState shape. */
export function invalid<Field extends string>(
  error: z.ZodError,
  values: Partial<Record<Field, string>>,
  message = 'Please fix the problems below.',
): FormState<Field> {
  const { fieldErrors } = z.flattenError(error)
  return {
    status: 'error',
    message,
    fieldErrors: fieldErrors as Partial<Record<Field, string[]>>,
    values,
    submissionId: Date.now(),
  }
}

/** A form-level error with no field to point at. */
export function failed<Field extends string>(message: string, values: Partial<Record<Field, string>> = {}): FormState<Field> {
  return { status: 'error', message, values, submissionId: Date.now() }
}

/** Reads one text field from FormData ('' when missing or a file). */
export function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}
