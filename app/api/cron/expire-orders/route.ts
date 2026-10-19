// GET /api/cron/expire-orders: the daily tidy-up, run by Vercel Cron
// (vercel.json). Vercel calls it with "Authorization: Bearer $CRON_SECRET";
// anyone else gets 401, so a stranger can't trigger it.
//
//   1. expire unpaid orders older than 30 minutes (stock and coupon back);
//   2. delete idempotency keys older than 24 hours;
//   3. delete demo customers older than 24 hours (their reservations are
//      released first; paid demo orders are kept, flagged is_demo).
//
// Why a cron AND lazy expiry: see lib/services/expiry.ts.
import { createHash, timingSafeEqual } from 'node:crypto'
import { problemResponse } from '@/lib/api/problem'
import { requestIdFrom, toProblem } from '@/lib/api/handler'
import { cleanupDemoCustomers } from '@/lib/services/demo'
import { expireDueOrders } from '@/lib/services/expiry'
import { purgeOldKeys } from '@/lib/services/idempotency'

/** Constant-time comparison of the bearer token with CRON_SECRET (both hashed to equal length first). */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || secret.length < 16) return false
  const sent = createHash('sha256').update(header).digest()
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(sent, expected)
}

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request)
  if (!authorised(request)) {
    return problemResponse({ status: 401, code: 'unauthorized', detail: 'This route is for the scheduled job only.' }, requestId)
  }
  try {
    const expired = await expireDueOrders({ limit: 1000 })
    const purged = await purgeOldKeys()
    const removed = await cleanupDemoCustomers()
    console.log(`[cron] ${requestId} expired ${expired} orders, purged ${purged} idempotency keys, removed ${removed} demo customers`)
    return Response.json({ expired_orders: expired, purged_idempotency_keys: purged, removed_demo_customers: removed }, { headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } })
  } catch (error) {
    return problemResponse(toProblem(error, requestId), requestId)
  }
}
