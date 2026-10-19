// IDEMPOTENCY: "do this once, however many times I ask".
//
// The problem: a customer taps "Place order", the network drops before
// the answer arrives, and the app (or the customer) tries again. Without
// protection the second request makes a SECOND order and reserves the
// stock twice. A double tap does the same.
//
// The fix: the client invents a random Idempotency-Key for the action and
// sends it with every attempt. The server remembers the key and the answer:
//
//   first request    → claim the key, place the order, SAVE the response
//   retry, same body → replay the saved response: same order, same 201,
//                      nothing runs again
//   retry, other body→ 422: one key must mean one request (a client bug)
//   while the first is still running → 409 "still in progress, retry soon"
//
// Only SUCCESSFUL responses are saved. A failed attempt (out of stock, a
// bad coupon, the database unreachable) changed nothing, because checkout
// is one transaction that rolled back, so its key is released and a retry
// runs for real; it may succeed once the cart is fixed.
//
// Used by POST /api/v1/orders (the Idempotency-Key header) AND by the
// checkout page (a hidden field generated when the page renders), so both
// paths are protected the same way.
import 'server-only'

import { createHash } from 'node:crypto'
import { http } from '@/lib/db/executor'
import * as repo from '@/lib/repos/idempotency'
import { conflict, invalid } from './errors'

export type IdempotentResult<T> = { status: number; body: T; location: string | null }

/** JSON with sorted keys, so {a,b} and {b,a} hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(canonical(body)).digest('hex')
}

/** A claim left "in progress" this long ago belongs to a request that crashed (its transaction rolled back). */
const STALE_CLAIM_SECONDS = 60

export async function runIdempotent<T>(
  input: { owner: string; endpoint: string; key: string; requestBody: unknown },
  work: () => Promise<IdempotentResult<T>>,
): Promise<IdempotentResult<T> & { replayed: boolean }> {
  const ids = { owner: input.owner, endpoint: input.endpoint, key: input.key }
  const requestHash = hashRequest(input.requestBody)

  let existing = await repo.claimIdempotencyKey(http, { ...ids, requestHash })
  if (existing && existing.state === 'in_progress' && Date.now() - existing.createdAt.getTime() > STALE_CLAIM_SECONDS * 1000) {
    // Take over a claim abandoned by a crashed request.
    await repo.releaseIdempotencyKey(http, ids)
    existing = await repo.claimIdempotencyKey(http, { ...ids, requestHash })
  }

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw invalid('idempotency_key_reused', 'This Idempotency-Key was already used with a different request body. Use a new key for a new request.')
    }
    if (existing.state === 'in_progress' || existing.responseStatus === null) {
      throw conflict('idempotency_in_progress', 'A request with this Idempotency-Key is still being processed. Wait a moment and retry with the same key.')
    }
    return { status: existing.responseStatus, body: existing.responseBody as T, location: existing.responseLocation, replayed: true }
  }

  try {
    const result = await work()
    await repo.completeIdempotencyKey(http, { ...ids, status: result.status, body: result.body, location: result.location })
    return { ...result, replayed: false }
  } catch (error) {
    await repo.releaseIdempotencyKey(http, ids).catch(() => {})
    throw error
  }
}

/** The daily cron: a key only needs to outlive any sensible retry (24 hours). */
export function purgeOldKeys(): Promise<number> {
  return repo.purgeOldIdempotencyKeys(http, 24)
}
