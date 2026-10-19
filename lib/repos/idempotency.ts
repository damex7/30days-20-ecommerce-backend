// IDEMPOTENCY KEYS: SQL only. The protocol is in lib/services/idempotency.ts.
import 'server-only'

import { z } from 'zod'
import { one, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'

export const IdempotencyRow = z.object({
  requestHash: z.string(),
  state: z.enum(['in_progress', 'done']),
  responseStatus: z.number().int().nullable(),
  responseBody: z.unknown(),
  responseLocation: z.string().nullable(),
  createdAt: z.date(),
})
export type IdempotencyRow = z.infer<typeof IdempotencyRow>

/**
 * Tries to CLAIM a key: INSERT ... ON CONFLICT DO NOTHING. If the insert
 * happened, this request is the first and must do the work (returns null).
 * If the row already existed, returns it: a replay, or a request still in
 * progress. The UNIQUE (owner, endpoint, key) index is the referee, so two
 * identical requests arriving at the same instant can't both "win".
 */
export async function claimIdempotencyKey(
  db: Db,
  input: { owner: string; endpoint: string; key: string; requestHash: string },
): Promise<IdempotencyRow | null> {
  const inserted = await db.query(q`
    INSERT INTO idempotency_keys (owner, endpoint, key, request_hash)
    VALUES (${input.owner}, ${input.endpoint}, ${input.key}, ${input.requestHash})
    ON CONFLICT (owner, endpoint, key) DO NOTHING
    RETURNING id`)
  if (inserted.length > 0) return null
  return one(
    db,
    IdempotencyRow,
    q`SELECT request_hash AS "requestHash", state, response_status AS "responseStatus",
             response_body AS "responseBody", response_location AS "responseLocation", created_at AS "createdAt"
      FROM idempotency_keys WHERE owner = ${input.owner} AND endpoint = ${input.endpoint} AND key = ${input.key}`,
    'claimIdempotencyKey',
  )
}

export async function completeIdempotencyKey(
  db: Db,
  input: { owner: string; endpoint: string; key: string; status: number; body: unknown; location: string | null },
): Promise<void> {
  await db.query(q`
    UPDATE idempotency_keys SET state = 'done', response_status = ${input.status},
           response_body = ${JSON.stringify(input.body)}::jsonb, response_location = ${input.location}, completed_at = now()
    WHERE owner = ${input.owner} AND endpoint = ${input.endpoint} AND key = ${input.key}`)
}

/**
 * Forgets a claim whose request failed in a way worth retrying (the
 * database was unreachable, Paystack timed out before anything was saved),
 * so the client's retry with the same key can run again. Answers that ARE
 * final (422, 409 out of stock) are saved with completeIdempotencyKey.
 */
export async function releaseIdempotencyKey(db: Db, input: { owner: string; endpoint: string; key: string }): Promise<void> {
  await db.query(q`DELETE FROM idempotency_keys WHERE owner = ${input.owner} AND endpoint = ${input.endpoint} AND key = ${input.key} AND state = 'in_progress'`)
}

/** The daily cron: keys are only needed for a day. */
export async function purgeOldIdempotencyKeys(db: Db, olderThanHours: number): Promise<number> {
  const result = await db.query(q`DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => ${olderThanHours}) RETURNING id`)
  return result.length
}
