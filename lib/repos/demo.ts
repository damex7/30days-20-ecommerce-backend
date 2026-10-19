// DEMO ACCOUNTS: SQL only (the rules are in lib/services/demo.ts).
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

/** A fresh demo customer: verified, no password, flagged is_demo. */
export async function insertDemoCustomer(tx: Db, input: { email: string; name: string }): Promise<string> {
  const result = await rows(
    tx,
    z.object({ id: z.uuid() }),
    q`INSERT INTO users (email, name, role, password_hash, email_verified_at, is_demo)
      VALUES (${input.email}, ${input.name}, 'customer', NULL, now(), true)
      RETURNING id`,
    'insertDemoCustomer',
  )
  return result[0]!.id
}

/** Two different in-stock products to start the demo cart with. */
export function pickDemoVariants(tx: Db, count: number): Promise<{ variantId: number }[]> {
  return rows(
    tx,
    z.object({ variantId: int8 }),
    q`SELECT DISTINCT ON (p.id) v.id AS "variantId"
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.status = 'active' AND v.status = 'active' AND v.stock >= 3
      ORDER BY p.id, v.price_kobo
      LIMIT ${count}`,
    'pickDemoVariants',
  )
}

export async function findDemoAccount(db: Db, email: string): Promise<string | null> {
  const result = await rows(db, z.object({ id: z.uuid() }), q`SELECT id FROM users WHERE email = ${email} AND is_demo AND deactivated_at IS NULL`, 'findDemoAccount')
  return result[0]?.id ?? null
}

/** Demo CUSTOMERS older than the cut-off (partial index users_demo_created_idx). */
export async function listExpiredDemoCustomers(db: Db, olderThanHours: number, limit: number): Promise<string[]> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`SELECT id FROM users
      WHERE is_demo AND role = 'customer' AND created_at < now() - make_interval(hours => ${olderThanHours})
      ORDER BY created_at LIMIT ${limit}`,
    'listExpiredDemoCustomers',
  )
  return result.map((r) => r.id)
}

/** Their still-unpaid orders (to cancel, releasing stock, before deleting). */
export async function listPendingOrderIdsOf(tx: Db, customerId: string): Promise<number[]> {
  const result = await rows(tx, z.object({ id: int8 }), q`SELECT id FROM orders WHERE customer_id = ${customerId} AND status = 'pending_payment'`, 'listPendingOrderIdsOf')
  return result.map((r) => r.id)
}

/**
 * Deletes a demo customer. ON DELETE does the rest: CASCADE removes their
 * sessions, cart, cart items and addresses; SET NULL detaches their PAID
 * orders (which stay, flagged is_demo) and their audit events.
 */
export async function deleteDemoCustomer(tx: Db, id: string): Promise<boolean> {
  const result = await tx.query(q`DELETE FROM users WHERE id = ${id} AND is_demo AND role = 'customer' RETURNING id`)
  return result.length > 0
}
