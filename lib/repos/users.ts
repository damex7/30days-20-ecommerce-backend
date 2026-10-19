// USERS for the admin list and the demo accounts: SQL only. (Sign-up,
// login and password changes stay in Day 17's lib/users.ts.)
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { empty, q } from '@/lib/db/sql'
import { roleSchema, type Role } from '@/lib/validation'

export const AdminUserRow = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
  emailVerifiedAt: z.date().nullable(),
  deactivatedAt: z.date().nullable(),
  isDemo: z.boolean(),
  orderCount: z.number().int(),
  createdAt: z.date(),
  cursorTs: z.string(),
})
export type AdminUserRow = z.infer<typeof AdminUserRow>

export function listUsersPage(
  db: Db,
  query: { search?: string; role?: Role; after?: { ts: string; id: string }; limit: number },
): Promise<AdminUserRow[]> {
  const like = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null
  return rows(
    db,
    AdminUserRow,
    q`SELECT u.id, u.email::text AS email, u.name, u.phone, u.role, u.email_verified_at AS "emailVerifiedAt",
             u.deactivated_at AS "deactivatedAt", u.is_demo AS "isDemo", u.created_at AS "createdAt",
             (SELECT count(*)::int FROM orders o WHERE o.customer_id = u.id) AS "orderCount",
             u.created_at::text AS "cursorTs"
      FROM users u
      WHERE true
        ${like ? q`AND (u.email ILIKE ${like} OR u.name ILIKE ${like})` : empty}
        ${query.role ? q`AND u.role = ${query.role}` : empty}
        ${query.after ? q`AND (u.created_at, u.id) < (${query.after.ts}::timestamptz, ${query.after.id}::uuid)` : empty}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ${query.limit + 1}`,
    'listUsersPage',
  )
}

export function findAdminUser(db: Db, id: string): Promise<AdminUserRow | null> {
  return one(
    db,
    AdminUserRow,
    q`SELECT u.id, u.email::text AS email, u.name, u.phone, u.role, u.email_verified_at AS "emailVerifiedAt",
             u.deactivated_at AS "deactivatedAt", u.is_demo AS "isDemo", u.created_at AS "createdAt",
             (SELECT count(*)::int FROM orders o WHERE o.customer_id = u.id) AS "orderCount",
             u.created_at::text AS "cursorTs"
      FROM users u WHERE u.id = ${id}`,
    'findAdminUser',
  )
}

/** Who gets the "new paid order" email: active staff and admins, never demo accounts. */
export async function listStaffEmails(db: Db): Promise<string[]> {
  const result = await rows(
    db,
    z.object({ email: z.string() }),
    q`SELECT email::text AS email FROM users WHERE role IN ('staff', 'admin') AND deactivated_at IS NULL AND NOT is_demo`,
    'listStaffEmails',
  )
  return result.map((r) => r.email)
}
