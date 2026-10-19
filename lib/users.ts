// USER QUERIES. Every read and write of the users table goes through here.
//
// Rules (the same as Day 16's lib/notes.ts):
// - Every value reaches SQL as a PARAMETER (${value} in the sql`` tagged
//   template). No string concatenation, ever.
// - Every row coming back is checked with Zod (lib/rows.ts).
// - password_hash only leaves this file through the *WithHash functions,
//   which only the login and password checks call. Pages never see it.
// - A change and the audit event describing it are written in ONE
//   statement or transaction, so neither can happen without the other.
import 'server-only'

import { sql, sqlTransaction } from '@/lib/db'
import { AdminUserSchema, parseRows, UserSchema, UserWithHashSchema, type AdminUser, type User, type UserWithHash } from '@/lib/rows'
import type { Role } from '@/lib/validation'
import { eventQuery } from '@/lib/auth/events'
import type { RequestInfo } from '@/lib/auth/request'
import { deleteOtherSessionsQuery } from '@/lib/auth/session'
import { hashToken } from '@/lib/auth/tokens'

const userColumns = () => sql`
  u.id, u.email::text AS email, u.name, u.phone, u.role,
  u.email_verified_at AS "emailVerifiedAt", u.must_change_password AS "mustChangePassword",
  u.deactivated_at AS "deactivatedAt", u.is_demo AS "isDemo", u.created_at AS "createdAt"`

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** For login: the user AND their hash. email is citext, so the match ignores case. */
export async function findUserWithHashByEmail(email: string): Promise<UserWithHash | null> {
  const rows = await sql`SELECT ${userColumns()}, u.password_hash AS "passwordHash" FROM users u WHERE u.email = ${email}`
  return parseRows(UserWithHashSchema, rows, 'findUserWithHashByEmail')[0] ?? null
}

/** For "enter your current password" checks on a signed-in account. */
export async function findUserWithHashById(id: string): Promise<UserWithHash | null> {
  const rows = await sql`SELECT ${userColumns()}, u.password_hash AS "passwordHash" FROM users u WHERE u.id = ${id}`
  return parseRows(UserWithHashSchema, rows, 'findUserWithHashById')[0] ?? null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT ${userColumns()} FROM users u WHERE u.email = ${email}`
  return parseRows(UserSchema, rows, 'findUserByEmail')[0] ?? null
}

// ---------------------------------------------------------------------------
// Signing up and verifying
// ---------------------------------------------------------------------------

/**
 * SIGN-UP (open, as on Days 17 and 19): creates a CUSTOMER account and
 * logs "signed_up", in ONE statement. Returns the new id, or null if the
 * email is already taken.
 *
 * The role is written here as the literal 'customer', never read from the
 * form or the JSON body, so nobody can sign themselves up as staff or an
 * admin. Staff accounts are made by an admin (createStaffUser below).
 *
 * ON CONFLICT DO NOTHING makes the UNIQUE index the judge: two sign-ups for
 * the same address at the same moment can't both succeed, and the loser
 * gets null rather than an error. (Checking "does it exist?" first and then
 * inserting would leave a gap between the two where both could pass.)
 */
export async function createUser(input: { name: string; email: string; phone: string | null; passwordHash: string }, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH created AS (
      INSERT INTO users (name, email, phone, password_hash, role)
      VALUES (${input.name}, ${input.email}, ${input.phone}, ${input.passwordHash}, 'customer')
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent)
    SELECT id, 'signed_up', ${request.ip}, ${request.userAgent} FROM created
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * STAFF ACCOUNTS (Day 18's createStaffUser): an admin creates them with a
 * temporary password (already hashed) and must_change_password = true, and
 * "user_created" is logged with the admin as actor, in ONE statement.
 * Returns the new id, or null if the email is taken. (Saying "that email
 * already has an account" is fine here: only an admin sees it.)
 */
export async function createStaffUser(
  actorId: string,
  input: { name: string; email: string; role: 'staff' | 'admin'; passwordHash: string },
  request: RequestInfo,
): Promise<string | null> {
  const rows = await sql`
    WITH created AS (
      INSERT INTO users (name, email, password_hash, role, must_change_password)
      VALUES (${input.name}, ${input.email}, ${input.passwordHash}, ${input.role}, true)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    )
    INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
    SELECT id, ${actorId}, 'user_created', ${request.ip}, ${request.userAgent},
           jsonb_build_object('role', ${input.role}::text)
    FROM created
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * Uses a verification token and marks the email verified, in one statement.
 *
 * `consumed` is the SINGLE-USE check: the UPDATE only matches a token that
 * is unused and unexpired, and sets used_at in the same step. If two clicks
 * arrive together, PostgreSQL locks the row for the first; the second then
 * sees used_at already set and matches nothing.
 *
 * Returns the user's id, or null if the token was invalid, used or expired.
 */
export async function verifyEmailWithToken(token: string, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH consumed AS (
      UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(token)} AND purpose = 'verify_email'
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    ),
    verified AS (
      UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
      WHERE id = (SELECT user_id FROM consumed)
      RETURNING id
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent)
    SELECT id, 'email_verified', ${request.ip}, ${request.userAgent} FROM verified
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/**
 * Resets a password with an email link, in one statement:
 * use the token (single use, as above), store the new hash, mark the email
 * verified (opening the link proved they own the inbox), sign out EVERY
 * session (whoever knew the old password is now locked out), and log it.
 *
 * Returns the user's id, or null if the link was invalid, used or expired.
 */
export async function resetPasswordWithToken(token: string, passwordHash: string, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH consumed AS (
      UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(token)} AND purpose = 'reset_password'
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    ),
    updated AS (
      -- Day 18: a deactivated account can't be brought back with a reset
      -- link, and a password the person chose themselves ends the
      -- "temporary password" state.
      UPDATE users SET password_hash = ${passwordHash},
                       email_verified_at = COALESCE(email_verified_at, now()),
                       must_change_password = false
      WHERE id = (SELECT user_id FROM consumed) AND deactivated_at IS NULL AND NOT is_demo
      RETURNING id
    ),
    signed_out AS (
      DELETE FROM sessions WHERE user_id = (SELECT id FROM updated) RETURNING 1
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent, metadata)
    SELECT id, 'password_reset', ${request.ip}, ${request.userAgent},
           jsonb_build_object('sessionsEnded', (SELECT count(*) FROM signed_out))
    FROM updated
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * Changes the password of a signed-in user and signs out every OTHER
 * session, keeping this browser signed in. If someone else had the old
 * password and was signed in somewhere, they're out now.
 */
export async function changePassword(userId: string, passwordHash: string, keepSessionId: string, request: RequestInfo): Promise<void> {
  await sqlTransaction((tx) => [
    // Choosing a password also ends the temporary-password state (Day 18).
    tx`UPDATE users SET password_hash = ${passwordHash}, must_change_password = false WHERE id = ${userId}`,
    deleteOtherSessionsQuery(tx, userId, keepSessionId),
    // Any reset link still sitting in an inbox stops working too.
    tx`UPDATE email_tokens SET used_at = now()
       WHERE user_id = ${userId} AND purpose = 'reset_password' AND used_at IS NULL`,
    eventQuery(tx, { type: 'password_changed', userId, request }),
  ])
}

/** Upgrades an old-settings hash after a successful login (see needsRehash). No event: nothing changed for the user. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

// Day 17's deleteUser is gone: accounts are deactivated, never deleted,
// because orders must keep saying who bought them. (Only demo customers are
// deleted, by the cron: lib/services/demo.ts.)

/** Name and (optional) phone, plus the audit event, in one transaction. */
export async function updateProfile(userId: string, input: { name: string; phone: string | null }, request: RequestInfo): Promise<void> {
  await sqlTransaction((tx) => [
    tx`UPDATE users SET name = ${input.name}, phone = ${input.phone} WHERE id = ${userId}`,
    eventQuery(tx, { type: 'profile_updated', userId, request }),
  ])
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const ADMIN_PAGE_SIZE = 20

/** Escapes LIKE's wildcards so a search for "50%" means the characters 5, 0 and %. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * One page of users for /admin/users, newest first, with an optional search on
 * email or name.
 *
 * - "Last login" is the newest logged_in event per user: an index scan on
 *   auth_events (user_id, created_at DESC) that stops at the first match.
 * - count(*) OVER () is a WINDOW FUNCTION: it counts all matching rows
 *   before LIMIT applies, so one query returns both the page and the total.
 * - OFFSET pagination is fine for an admin list of this size. For a big
 *   public list, keyset pagination (Day 16) stays fast on page 1,000.
 */
export async function listUsers({ q, page }: { q: string; page: number }): Promise<{ users: AdminUser[]; total: number }> {
  const search = q ? sql`WHERE u.email ILIKE ${likePattern(q)} OR u.name ILIKE ${likePattern(q)}` : sql``
  const rows = await sql`
    SELECT ${userColumns()},
           (SELECT e.created_at FROM auth_events e
            WHERE e.user_id = u.id AND e.type = 'logged_in'
            ORDER BY e.created_at DESC LIMIT 1) AS "lastLoginAt",
           (SELECT count(*)::int FROM sessions s
            WHERE s.user_id = u.id AND s.expires_at > now()) AS "activeSessions",
           count(*) OVER ()::int AS total
    FROM users u
    ${search}
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`
  const total = Number(rows[0]?.total ?? 0)
  const users = parseRows(AdminUserSchema, rows, 'listUsers')
  return { users, total }
}

/**
 * Promotes or demotes a user. `id <> actorId` in the WHERE clause means an
 * admin can NEVER change their own role, even with a hand-crafted request:
 * the database simply finds no row to update. (So there is always at least
 * one admin: the last one can't demote themselves.)
 *
 * Returns false if nothing changed (self, unknown user, or already that role).
 */
export async function setRole(actorId: string, userId: string, role: Role, request: RequestInfo): Promise<boolean> {
  const rows = await sql`
    WITH changed AS (
      UPDATE users u SET role = ${role}
      FROM (SELECT id, role FROM users WHERE id = ${userId}) old
      WHERE u.id = old.id AND u.id <> ${actorId} AND old.role <> ${role}
        -- Demo accounts keep their role: the shared demo admin stays an admin.
        AND NOT u.is_demo
      RETURNING u.id, old.role AS from_role
    )
    INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
    SELECT id, ${actorId}, 'role_changed', ${request.ip}, ${request.userAgent},
           jsonb_build_object('from', from_role, 'to', ${role}::text)
    FROM changed
    RETURNING id`
  return rows.length > 0
}

/**
 * Deactivates or reactivates an account, in ONE statement (a single
 * statement is always all-or-nothing, so its three writes are one
 * transaction):
 * - `changed` flips deactivated_at, but only for SOMEONE ELSE (`id <> actorId`:
 *   an admin can never lock themselves out) and only if it isn't already in
 *   that state;
 * - `signed_out` deletes every session of a deactivated user, so they are
 *   signed out on their very next request (readSession also ignores
 *   deactivated users, as a second guard);
 * - the INSERT logs who did it.
 * Returns false if nothing changed.
 */
export async function setActive(actorId: string, userId: string, active: boolean, request: RequestInfo): Promise<boolean> {
  const rows = await sql`
    WITH changed AS (
      UPDATE users SET deactivated_at = CASE WHEN ${active}::boolean THEN NULL ELSE now() END
      WHERE id = ${userId} AND id <> ${actorId} AND NOT is_demo
        AND (deactivated_at IS NULL) <> ${active}::boolean
      RETURNING id
    ),
    signed_out AS (
      DELETE FROM sessions
      WHERE NOT ${active}::boolean AND user_id IN (SELECT id FROM changed)
      RETURNING 1
    )
    INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
    SELECT id, ${actorId}, CASE WHEN ${active}::boolean THEN 'user_reactivated' ELSE 'user_deactivated' END,
           ${request.ip}, ${request.userAgent},
           jsonb_build_object('sessionsEnded', (SELECT count(*) FROM signed_out))
    FROM changed
    RETURNING id`
  return rows.length > 0
}
