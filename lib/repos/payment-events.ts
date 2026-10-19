// PAYMENT EVENTS (the webhook log): SQL only.
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const PAYMENT_OUTCOMES = ['paid', 'already_paid', 'amount_mismatch', 'unknown_order', 'needs_refund', 'ignored', 'failed'] as const
export type PaymentOutcome = (typeof PAYMENT_OUTCOMES)[number]

export const PaymentEventRow = z.object({
  id: int8,
  eventId: z.string(),
  source: z.enum(['webhook', 'callback']),
  eventType: z.string(),
  reference: z.string().nullable(),
  orderId: int8.nullable(),
  orderNumber: z.string().nullable(),
  amountKobo: int8.nullable(),
  currency: z.string().nullable(),
  outcome: z.enum(PAYMENT_OUTCOMES).nullable(),
  detail: z.string().nullable(),
  receivedAt: z.date(),
  processedAt: z.date().nullable(),
  cursorTs: z.string(),
})
export type PaymentEventRow = z.infer<typeof PaymentEventRow>

/**
 * RECORDS AN EVENT, ONCE. ON CONFLICT (event_id) DO NOTHING: if Paystack
 * delivers the same event again, nothing is inserted and this returns
 * null, which tells the caller "already handled, stop". Returns the new
 * row's id otherwise. Called inside the same transaction that applies the
 * event, so "recorded" and "applied" commit together.
 */
export async function recordPaymentEvent(
  tx: Db,
  input: { eventId: string; source: 'webhook' | 'callback'; eventType: string; reference: string | null; amountKobo: number | null; currency: string | null; payload: unknown },
): Promise<number | null> {
  const result = await rows(
    tx,
    z.object({ id: int8 }),
    q`INSERT INTO payment_events (event_id, source, event_type, reference, amount_kobo, currency, payload)
      VALUES (${input.eventId}, ${input.source}, ${input.eventType}, ${input.reference}, ${input.amountKobo}, ${input.currency},
              ${JSON.stringify(input.payload)}::jsonb)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id`,
    'recordPaymentEvent',
  )
  return result[0]?.id ?? null
}

export async function setPaymentOutcome(tx: Db, id: number, input: { outcome: PaymentOutcome; detail: string | null; orderId: number | null }): Promise<void> {
  await tx.query(q`
    UPDATE payment_events SET outcome = ${input.outcome}, detail = ${input.detail}, order_id = ${input.orderId}, processed_at = now()
    WHERE id = ${id}`)
}

export function listPaymentEvents(db: Db, after: { ts: string; id: number } | undefined, limit: number): Promise<PaymentEventRow[]> {
  const cursor = after ? q`WHERE (e.received_at, e.id) < (${after.ts}::timestamptz, ${after.id})` : q``
  return rows(
    db,
    PaymentEventRow,
    q`SELECT e.id, e.event_id AS "eventId", e.source, e.event_type AS "eventType", e.reference, e.order_id AS "orderId",
             o.number AS "orderNumber", e.amount_kobo AS "amountKobo", e.currency, e.outcome, e.detail,
             e.received_at AS "receivedAt", e.processed_at AS "processedAt", e.received_at::text AS "cursorTs"
      FROM payment_events e LEFT JOIN orders o ON o.id = e.order_id
      ${cursor}
      ORDER BY e.received_at DESC, e.id DESC LIMIT ${limit + 1}`,
    'listPaymentEvents',
  )
}
