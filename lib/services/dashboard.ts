// THE ADMIN OVERVIEW: last 30 days' real sales (demo orders excluded), the
// work waiting, and what's about to sell out.
import 'server-only'

import { http } from '@/lib/db/executor'
import { lowStock, salesSummary } from '@/lib/repos/stats'
import type { Actor } from './actor'
import { expireDueOrders } from './expiry'
import { authorize } from './permissions'

export async function getDashboard(actor: Actor) {
  authorize(actor, 'orders.read_all')
  await expireDueOrders({ limit: 50 })
  const [summary, low] = await Promise.all([salesSummary(http, 30), lowStock(http, 2, 8)])
  return { summary, low }
}
