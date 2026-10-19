// ROW SHAPES: Zod schemas for what comes BACK from PostgreSQL (the Day 16
// pattern). The driver types every row as Record<string, any>; parsing at
// the boundary turns that into real types, and a renamed column fails
// loudly right at the query instead of as `undefined` somewhere else.
//
// The driver already turns timestamptz into a JavaScript Date, and the
// queries alias snake_case columns to camelCase (`created_at AS "createdAt"`).
import 'server-only'

import { z } from 'zod'
import { roleSchema } from '@/lib/validation'

/** Parses rows at the boundary; a mismatch names the query that caused it. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown[], query: string): T[] {
  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) {
    throw new Error(`Rows from ${query} didn't match the expected shape: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

/**
 * A PostgreSQL bigint (int8). The driver returns it as a STRING, because a
 * JavaScript number can't hold every int8. Our ids and kobo amounts stay far
 * below 2^53, so they're converted to numbers here, and anything that
 * wouldn't fit exactly is refused rather than silently rounded.
 */
export const int8 = z
  .union([z.string().regex(/^-?d+$/), z.number().int(), z.bigint()])
  .transform((value) => Number(value))
  .pipe(z.number().int().refine(Number.isSafeInteger, 'bigint is too large for a JavaScript number'))

/** The signed-in user, as the rest of the app sees them. No password hash. */
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  /** Optional mobile number in +234 form. */
  phone: z.string().nullable(),
  role: roleSchema,
  emailVerifiedAt: z.date().nullable(),
  /** Day 18: true until someone given a temporary password chooses their own. */
  mustChangePassword: z.boolean(),
  /** Day 18: set when an admin deactivates the account (it can then no longer sign in). */
  deactivatedAt: z.date().nullable(),
  /** Day 20: a demo account (DEMO_MODE). Demo staff/admin are read-only; none has a password. */
  isDemo: z.boolean(),
  createdAt: z.date(),
})
export type User = z.infer<typeof UserSchema>

/** Only lib/users.ts and the login/password checks ever see this one. */
export const UserWithHashSchema = UserSchema.extend({ passwordHash: z.string().nullable() })
export type UserWithHash = z.infer<typeof UserWithHashSchema>

export const SessionSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  createdAt: z.date(),
  expiresAt: z.date(),
  lastSeenAt: z.date(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  location: z.string().nullable(),
})
export type Session = z.infer<typeof SessionSchema>

export const AdminUserSchema = UserSchema.extend({
  lastLoginAt: z.date().nullable(),
  activeSessions: z.number().int(),
})
export type AdminUser = z.infer<typeof AdminUserSchema>
