// NUMBERS FOR THE ADMIN OVERVIEW: SQL only. Demo orders (is_demo) are left
// out of every sales figure, so portfolio visitors' test purchases never
// look like real takings.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const SalesSummaryRow = z.object({
  paidOrders: z.number().int(),
  revenueKobo: int8,
  awaitingPayment: z.number().int(),
  toShip: z.number().int(),
  demoOrders: z.number().int(),
})
export type SalesSummaryRow = z.infer<typeof SalesSummaryRow>

export async function salesSummary(db: Db, days: number): Promise<SalesSummaryRow> {
  const row = await one(
    db,
    SalesSummaryRow,
    q`SELECT
        count(*) FILTER (WHERE paid_at IS NOT NULL AND status <> 'refunded' AND NOT is_demo)::int AS "paidOrders",
        coalesce(sum(total_kobo) FILTER (WHERE paid_at IS NOT NULL AND status <> 'refunded' AND NOT is_demo), 0) AS "revenueKobo",
        count(*) FILTER (WHERE status = 'pending_payment')::int AS "awaitingPayment",
        count(*) FILTER (WHERE status IN ('paid', 'processing'))::int AS "toShip",
        count(*) FILTER (WHERE is_demo)::int AS "demoOrders"
      FROM orders
      WHERE created_at >= now() - make_interval(days => ${days})`,
    'salesSummary',
  )
  return row ?? { paidOrders: 0, revenueKobo: 0, awaitingPayment: 0, toShip: 0, demoOrders: 0 }
}

export const LowStockRow = z.object({ variantId: int8, productId: int8, productName: z.string(), sku: z.string(), size: z.string(), colour: z.string(), stock: z.number().int() })
export type LowStockRow = z.infer<typeof LowStockRow>

export function lowStock(db: Db, threshold: number, limit: number): Promise<LowStockRow[]> {
  return rows(
    db,
    LowStockRow,
    q`SELECT v.id AS "variantId", p.id AS "productId", p.name AS "productName", v.sku, v.size, v.colour, v.stock
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.status = 'active' AND p.status = 'active' AND v.stock <= ${threshold}
      ORDER BY v.stock, p.name, v.sku LIMIT ${limit}`,
    'lowStock',
  )
}
