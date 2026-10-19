// Used ONLY by proxy.ts: "may whoever holds this session token see order N?"
//
// Under Cache Components a page starts streaming "200 OK" before its own
// checks run, and a status can't change once streaming has begun. The
// proxy runs BEFORE rendering, so it can answer someone else's order with a
// true 404. The page still loads the order through the owner-scoped
// service, which is what actually keeps it private; this only makes the
// HTTP status honest (the Day 19 pattern).
import 'server-only'

import { sql } from '@/lib/db'

export async function orderVisibility(tokenHash: string, orderId: number): Promise<'visible' | 'hidden' | 'no_session'> {
  const rows = await sql`
    SELECT EXISTS (
             SELECT 1 FROM orders o
             WHERE o.id = ${orderId} AND (u.role IN ('staff', 'admin') OR o.customer_id = u.id)
           ) AS visible
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.deactivated_at IS NULL
    WHERE s.id = ${tokenHash} AND s.expires_at > now()`
  const row = rows[0]
  if (!row) return 'no_session'
  return row.visible === true ? 'visible' : 'hidden'
}
