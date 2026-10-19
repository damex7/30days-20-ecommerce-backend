// ADDRESSES AND DELIVERY FEES: SQL only.
//
// OWNERSHIP IS IN THE SQL: every address query has
// `WHERE customer_id = $customer`. Ask for someone else's address id and
// the query simply finds nothing, which the service reports as 404.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const AddressRow = z.object({
  id: int8,
  customerId: z.uuid(),
  label: z.string().nullable(),
  recipientName: z.string(),
  phone: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  landmark: z.string().nullable(),
  isDefault: z.boolean(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AddressRow = z.infer<typeof AddressRow>

const columns = q`
  a.id, a.customer_id AS "customerId", a.label, a.recipient_name AS "recipientName", a.phone,
  a.street, a.city, a.state, a.landmark, a.is_default AS "isDefault", a.version,
  a.created_at AS "createdAt", a.updated_at AS "updatedAt"`

export const MAX_ADDRESSES = 10

export function listAddresses(db: Db, customerId: string): Promise<AddressRow[]> {
  return rows(db, AddressRow, q`SELECT ${columns} FROM addresses a WHERE a.customer_id = ${customerId} ORDER BY a.is_default DESC, a.created_at, a.id`, 'listAddresses')
}

export function findAddress(db: Db, customerId: string, id: number): Promise<AddressRow | null> {
  return one(db, AddressRow, q`SELECT ${columns} FROM addresses a WHERE a.id = ${id} AND a.customer_id = ${customerId}`, 'findAddress')
}

export type AddressInput = {
  label: string | null
  recipientName: string
  phone: string
  street: string
  city: string
  state: string
  landmark: string | null
  isDefault: boolean
}

/**
 * Inserts an address. The customer's FIRST address becomes the default
 * automatically. Making a new address the default first clears the old
 * default, so the partial unique index "one default per customer" is
 * never violated, and both happen in the CALLER'S transaction (a crash in
 * between can't leave the customer with no default).
 *
 * Why two statements rather than one data-modifying CTE: all parts of one
 * statement see the SAME snapshot and the unique index is checked as each
 * row is written, so "clear old default + insert new default" in a single
 * statement can still trip the index.
 */
export async function insertAddress(tx: Db, customerId: string, input: AddressInput): Promise<AddressRow> {
  const existing = await tx.query(q`SELECT count(*)::int AS n FROM addresses WHERE customer_id = ${customerId}`)
  const makeDefault = input.isDefault || Number(existing[0]?.n ?? 0) === 0
  if (makeDefault) await tx.query(q`UPDATE addresses SET is_default = false WHERE customer_id = ${customerId} AND is_default`)
  const result = await rows(
    tx,
    AddressRow,
    q`WITH a AS (
        INSERT INTO addresses (customer_id, label, recipient_name, phone, street, city, state, landmark, is_default)
        VALUES (${customerId}, ${input.label}, ${input.recipientName}, ${input.phone}, ${input.street},
                ${input.city}, ${input.state}, ${input.landmark}, ${makeDefault})
        RETURNING *
      )
      SELECT ${columns} FROM a`,
    'insertAddress',
  )
  return result[0]!
}

export async function countAddresses(db: Db, customerId: string): Promise<number> {
  const result = await db.query(q`SELECT count(*)::int AS n FROM addresses WHERE customer_id = ${customerId}`)
  return Number(result[0]?.n ?? 0)
}

/** Optimistic concurrency; null = stale version or not this customer's address. */
export async function updateAddress(tx: Db, customerId: string, id: number, version: number, patch: Partial<AddressInput>): Promise<AddressRow | null> {
  if (patch.isDefault === true) {
    await tx.query(q`UPDATE addresses SET is_default = false WHERE customer_id = ${customerId} AND is_default AND id <> ${id}`)
  }
  return one(
    tx,
    AddressRow,
    q`WITH a AS (
        UPDATE addresses SET
          label = CASE WHEN ${patch.label !== undefined}::boolean THEN ${patch.label ?? null} ELSE label END,
          recipient_name = COALESCE(${patch.recipientName ?? null}, recipient_name),
          phone = COALESCE(${patch.phone ?? null}, phone),
          street = COALESCE(${patch.street ?? null}, street),
          city = COALESCE(${patch.city ?? null}, city),
          state = COALESCE(${patch.state ?? null}, state),
          landmark = CASE WHEN ${patch.landmark !== undefined}::boolean THEN ${patch.landmark ?? null} ELSE landmark END,
          -- The default can be moved to another address, never just switched off
          -- (that would leave the customer with no default).
          is_default = is_default OR COALESCE(${patch.isDefault ?? null}::boolean, false),
          version = version + 1
        WHERE id = ${id} AND customer_id = ${customerId} AND version = ${version}
        RETURNING *
      )
      SELECT ${columns} FROM a`,
    'updateAddress',
  )
}

/**
 * Deletes one address. If it was the default, the oldest remaining address
 * becomes the default (in the same transaction).
 */
export async function deleteAddress(tx: Db, customerId: string, id: number): Promise<boolean> {
  const deleted = await tx.query(q`DELETE FROM addresses WHERE id = ${id} AND customer_id = ${customerId} RETURNING is_default`)
  if (deleted.length === 0) return false
  if (deleted[0]?.is_default === true) {
    await tx.query(q`
      UPDATE addresses SET is_default = true
      WHERE id = (SELECT id FROM addresses WHERE customer_id = ${customerId} ORDER BY created_at, id LIMIT 1)`)
  }
  return true
}

// ---------------------------------------------------------------------------
// Delivery fees
// ---------------------------------------------------------------------------

export const DeliveryFeeRow = z.object({
  state: z.string(),
  feeKobo: int8,
  minDays: z.number().int(),
  maxDays: z.number().int(),
  version: z.number().int(),
  updatedAt: z.date(),
})
export type DeliveryFeeRow = z.infer<typeof DeliveryFeeRow>

const feeColumns = q`state, fee_kobo AS "feeKobo", min_days AS "minDays", max_days AS "maxDays", version, updated_at AS "updatedAt"`

export function listDeliveryFees(db: Db): Promise<DeliveryFeeRow[]> {
  return rows(db, DeliveryFeeRow, q`SELECT ${feeColumns} FROM delivery_fees ORDER BY state`, 'listDeliveryFees')
}

export function findDeliveryFee(db: Db, state: string): Promise<DeliveryFeeRow | null> {
  return one(db, DeliveryFeeRow, q`SELECT ${feeColumns} FROM delivery_fees WHERE state = ${state}`, 'findDeliveryFee')
}

export function updateDeliveryFee(
  db: Db,
  state: string,
  version: number,
  patch: { feeKobo?: number; minDays?: number; maxDays?: number },
): Promise<DeliveryFeeRow | null> {
  return one(
    db,
    DeliveryFeeRow,
    q`UPDATE delivery_fees SET
        fee_kobo = COALESCE(${patch.feeKobo ?? null}::bigint, fee_kobo),
        min_days = COALESCE(${patch.minDays ?? null}::smallint, min_days),
        max_days = COALESCE(${patch.maxDays ?? null}::smallint, max_days),
        version = version + 1
      WHERE state = ${state} AND version = ${version}
      RETURNING ${feeColumns}`,
    'updateDeliveryFee',
  )
}
