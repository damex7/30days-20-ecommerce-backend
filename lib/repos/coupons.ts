// COUPONS AND REDEMPTIONS: SQL only. The rules ("is it valid for this
// cart?") are in lib/services/coupons.ts; the race-proof CLAIM is here.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const CouponRow = z.object({
  id: int8,
  code: z.string(),
  description: z.string(),
  kind: z.enum(['percent', 'fixed']),
  value: int8,
  minOrderKobo: int8,
  maxUses: z.number().int().nullable(),
  uses: z.number().int(),
  perCustomerLimit: z.number().int().nullable(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  active: z.boolean(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cursorTs: z.string(),
})
export type CouponRow = z.infer<typeof CouponRow>

const columns = q`
  c.id, c.code::text AS code, c.description, c.kind, c.value, c.min_order_kobo AS "minOrderKobo",
  c.max_uses AS "maxUses", c.uses, c.per_customer_limit AS "perCustomerLimit",
  c.starts_at AS "startsAt", c.ends_at AS "endsAt", c.active, c.version,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.created_at::text AS "cursorTs"`

/** code is citext: "aba10" finds "ABA10". */
export function findCouponByCode(db: Db, code: string): Promise<CouponRow | null> {
  return one(db, CouponRow, q`SELECT ${columns} FROM coupons c WHERE c.code = ${code}`, 'findCouponByCode')
}

export function findCouponById(db: Db, id: number): Promise<CouponRow | null> {
  return one(db, CouponRow, q`SELECT ${columns} FROM coupons c WHERE c.id = ${id}`, 'findCouponById')
}

export function listCoupons(db: Db, after: { ts: string; id: number } | undefined, limit: number): Promise<CouponRow[]> {
  const cursor = after ? q`WHERE (c.created_at, c.id) < (${after.ts}::timestamptz, ${after.id})` : q``
  return rows(db, CouponRow, q`SELECT ${columns} FROM coupons c ${cursor} ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit + 1}`, 'listCoupons')
}

/** How many orders this customer currently holds with this coupon. */
export async function countRedemptions(db: Db, couponId: number, customerId: string): Promise<number> {
  const result = await db.query(q`SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_id = ${couponId} AND customer_id = ${customerId}`)
  return Number(result[0]?.n ?? 0)
}

export type CouponInput = {
  code: string
  description: string
  kind: 'percent' | 'fixed'
  value: number
  minOrderKobo: number
  maxUses: number | null
  perCustomerLimit: number | null
  startsAt: Date | null
  endsAt: Date | null
  active: boolean
}

export function insertCoupon(db: Db, input: CouponInput): Promise<CouponRow | null> {
  return one(
    db,
    CouponRow,
    q`WITH c AS (
        INSERT INTO coupons (code, description, kind, value, min_order_kobo, max_uses, per_customer_limit, starts_at, ends_at, active)
        VALUES (${input.code}, ${input.description}, ${input.kind}, ${input.value}, ${input.minOrderKobo},
                ${input.maxUses}, ${input.perCustomerLimit}, ${input.startsAt}, ${input.endsAt}, ${input.active})
        RETURNING *
      )
      SELECT ${columns} FROM c`,
    'insertCoupon',
  )
}

/** A PATCH: `undefined` = leave alone, `null` = clear (for the nullable fields). */
export function updateCoupon(db: Db, id: number, version: number, patch: Partial<CouponInput>): Promise<CouponRow | null> {
  const has = (key: keyof CouponInput) => patch[key] !== undefined
  return one(
    db,
    CouponRow,
    q`WITH c AS (
        UPDATE coupons SET
          code = COALESCE(${patch.code ?? null}, code),
          description = COALESCE(${patch.description ?? null}, description),
          kind = COALESCE(${patch.kind ?? null}, kind),
          value = COALESCE(${patch.value ?? null}::bigint, value),
          min_order_kobo = COALESCE(${patch.minOrderKobo ?? null}::bigint, min_order_kobo),
          max_uses = CASE WHEN ${has('maxUses')}::boolean THEN ${patch.maxUses ?? null}::int ELSE max_uses END,
          per_customer_limit = CASE WHEN ${has('perCustomerLimit')}::boolean THEN ${patch.perCustomerLimit ?? null}::int ELSE per_customer_limit END,
          starts_at = CASE WHEN ${has('startsAt')}::boolean THEN ${patch.startsAt ?? null}::timestamptz ELSE starts_at END,
          ends_at = CASE WHEN ${has('endsAt')}::boolean THEN ${patch.endsAt ?? null}::timestamptz ELSE ends_at END,
          active = COALESCE(${patch.active ?? null}::boolean, active),
          version = version + 1
        WHERE id = ${id} AND version = ${version}
        RETURNING *
      )
      SELECT ${columns} FROM c`,
    'updateCoupon',
  )
}

/**
 * CLAIMS ONE USE OF A COUPON, safely, at checkout. A GUARDED UPDATE: it
 * only matches if the coupon is still active, inside its dates, not used
 * up, and under this customer's limit, all checked AT THE MOMENT the row is
 * locked. Two customers racing for the last use: the first UPDATE locks the
 * row and takes it; the second waits, re-checks `uses < max_uses` against
 * the new value, and matches nothing. (The CHECK uses <= max_uses in 009
 * backs this up.)
 *
 * The per-customer count can't race either: checkout locks the customer's
 * cart row first (lockCart), so one customer's checkouts run one at a time,
 * and each statement here sees the previous one's committed redemption.
 *
 * Returns false if the claim failed (the service then explains why).
 */
export async function claimCoupon(tx: Db, couponId: number, customerId: string): Promise<boolean> {
  const result = await tx.query(q`
    UPDATE coupons c SET uses = c.uses + 1
    WHERE c.id = ${couponId}
      AND c.active
      AND (c.starts_at IS NULL OR c.starts_at <= now())
      AND (c.ends_at IS NULL OR c.ends_at > now())
      AND (c.max_uses IS NULL OR c.uses < c.max_uses)
      AND (c.per_customer_limit IS NULL OR
           (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id AND r.customer_id = ${customerId}) < c.per_customer_limit)
    RETURNING c.id`)
  return result.length > 0
}

export async function insertRedemption(tx: Db, input: { couponId: number; customerId: string; orderId: number; discountKobo: number }): Promise<void> {
  await tx.query(q`
    INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id, discount_kobo)
    VALUES (${input.couponId}, ${input.customerId}, ${input.orderId}, ${input.discountKobo})`)
}

/**
 * GIVES A USE BACK when an unpaid order is cancelled or expires: deletes
 * the redemption and decrements uses, in one statement. A refunded (paid)
 * order keeps its redemption: the coupon WAS used.
 */
export async function releaseCoupon(tx: Db, orderId: number): Promise<void> {
  await tx.query(q`
    WITH r AS (DELETE FROM coupon_redemptions WHERE order_id = ${orderId} RETURNING coupon_id)
    UPDATE coupons SET uses = uses - 1 WHERE id IN (SELECT coupon_id FROM r) AND uses > 0`)
}
