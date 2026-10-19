// USERS: the admin's view of accounts, and everyone's own profile.
import 'server-only'

import type { RequestInfo } from '@/lib/auth/request'
import { http } from '@/lib/db/executor'
import { decodeCursor, encodeCursor, toPage, type Page } from '@/lib/pagination'
import * as repo from '@/lib/repos/users'
import type { AdminUserRow } from '@/lib/repos/users'
import type { User } from '@/lib/rows'
import { createStaffUser, setActive, setRole, updateProfile as updateProfileRow } from '@/lib/users'
import { generateTemporaryPassword } from '@/lib/auth/temp-password'
import { hashPassword } from '@/lib/auth/password'
import type { Role } from '@/lib/validation'
import type { Actor } from './actor'
import { conflict, notFound } from './errors'
import { authorize } from './permissions'
import { forViewer, maskEmail, maskPhone } from './privacy'

function mask(actor: Actor, user: AdminUserRow): AdminUserRow {
  // Demo admin: other people's contact details are masked (their own demo accounts are fake anyway).
  return forViewer(actor, user, (u) => (u.isDemo ? u : { ...u, email: maskEmail(u.email), phone: u.phone ? maskPhone(u.phone) : null }))
}

export async function listUsers(actor: Actor, input: { q?: string; role?: Role; cursor?: string; limit: number }): Promise<Page<AdminUserRow>> {
  authorize(actor, 'users.read')
  const filters = { q: input.q, role: input.role }
  const key = input.cursor ? decodeCursor(input.cursor, 'newest', filters) : null
  const rows = await repo.listUsersPage(http, { search: input.q, role: input.role, after: key ? { ts: String(key[0]), id: String(key[1]) } : undefined, limit: input.limit })
  const page = toPage(rows, input.limit, (last) => encodeCursor('newest', filters, [last.cursorTs, last.id]))
  return { ...page, items: page.items.map((u) => mask(actor, u)) }
}

export async function getUser(actor: Actor, id: string): Promise<AdminUserRow> {
  authorize(actor, 'users.read')
  const user = await repo.findAdminUser(http, id)
  if (!user) throw notFound('User')
  return mask(actor, user)
}

/**
 * Role and active changes. The SQL itself refuses changing your own
 * account (an admin can't demote or lock out themselves) and demo accounts.
 */
export async function changeUser(actor: Actor, id: string, input: { role?: Role; active?: boolean }, request: RequestInfo): Promise<AdminUserRow> {
  authorize(actor, 'users.manage')
  if (actor.kind !== 'user') throw new Error('users: only a person can change users')
  const current = await repo.findAdminUser(http, id)
  if (!current) throw notFound('User')
  if (id === actor.user.id) throw conflict('own_account', 'You can’t change your own role or deactivate yourself. Ask another admin.')
  if (current.isDemo) throw conflict('demo_account', 'Demo accounts can’t be changed.')
  if (input.role && input.role !== current.role) await setRole(actor.user.id, id, input.role, request)
  if (input.active !== undefined && input.active !== (current.deactivatedAt === null)) await setActive(actor.user.id, id, input.active, request)
  return getUser(actor, id)
}

/** Creates a staff or admin account with a temporary password, shown ONCE (Day 18). */
export async function createStaff(actor: Actor, input: { name: string; email: string; role: 'staff' | 'admin' }, request: RequestInfo): Promise<{ id: string; temporaryPassword: string }> {
  authorize(actor, 'users.manage')
  if (actor.kind !== 'user') throw new Error('users: only a person can create staff')
  const temporaryPassword = generateTemporaryPassword()
  const id = await createStaffUser(actor.user.id, { ...input, passwordHash: await hashPassword(temporaryPassword) }, request)
  if (!id) throw conflict('email_taken', 'There is already an account with that email address.')
  return { id, temporaryPassword }
}

/** /me: the signed-in person's own profile. */
export function getProfile(actor: Actor): User {
  authorize(actor, 'profile.read')
  if (actor.kind !== 'user') throw new Error('profile: not a user')
  return actor.user
}

export async function updateProfile(actor: Actor, input: { name: string; phone: string | null }, request: RequestInfo): Promise<User> {
  authorize(actor, 'profile.update')
  if (actor.kind !== 'user') throw new Error('profile: not a user')
  await updateProfileRow(actor.user.id, input, request)
  return { ...actor.user, ...input }
}
