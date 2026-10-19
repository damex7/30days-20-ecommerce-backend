// PAYSTACK, called with fetch (no SDK): initialize, verify, and checking a
// webhook's signature. Test mode is the same API with sk_test_ keys.
//
// The SECRET key never leaves the server: it signs our requests to
// Paystack and checks Paystack's signature on webhooks. The browser only
// ever sees the authorization_url Paystack gives us for the customer.
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ServiceError } from '@/lib/services/errors'

const BASE = 'https://api.paystack.co'
const TIMEOUT_MS = 10_000

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new ServiceError('unavailable', 'payments_not_configured', 'Payments aren’t set up on this server yet (PAYSTACK_SECRET_KEY is missing).')
  return key
}

/** Paystack wraps every answer as { status, message, data }. */
async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError('unavailable', 'payment_provider_unreachable', 'We couldn’t reach Paystack. Please try again in a moment.')
  }
  const json: unknown = await response.json().catch(() => null)
  const envelope = z.object({ status: z.boolean(), message: z.string(), data: z.unknown() }).safeParse(json)
  if (!response.ok || !envelope.success || !envelope.data.status) {
    const message = envelope.success ? envelope.data.message : `HTTP ${response.status}`
    console.error(`[paystack] ${path} failed: ${message}`)
    throw new ServiceError('unavailable', 'payment_provider_error', 'Paystack couldn’t start this payment just now. Please try again in a moment.')
  }
  return schema.parse(envelope.data.data)
}

const InitializeData = z.object({ authorization_url: z.url(), access_code: z.string(), reference: z.string() })

/**
 * Starts a payment. `amount` is in KOBO (Paystack's unit for NGN too), so
 * our integer kobo goes straight in: no conversion, no rounding.
 */
export async function initializeTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}): Promise<{ authorizationUrl: string; reference: string }> {
  const data = await call(
    '/transaction/initialize',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    },
    InitializeData,
  )
  return { authorizationUrl: data.authorization_url, reference: data.reference }
}

/** The fields of a transaction we act on (from verify, and from a charge.success webhook). */
export const PaystackTransaction = z.object({
  id: z.number().int(),
  status: z.string(), // "success", "failed", "abandoned", ...
  reference: z.string(),
  amount: z.number().int(), // kobo
  currency: z.string(),
})
export type PaystackTransaction = z.infer<typeof PaystackTransaction>

/** Asks Paystack directly what happened to a payment. The callback page uses this. */
export async function verifyTransaction(reference: string): Promise<{ transaction: PaystackTransaction; raw: unknown }> {
  const raw = await call(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }, z.unknown())
  return { transaction: PaystackTransaction.parse(raw), raw }
}

/**
 * IS THIS WEBHOOK REALLY FROM PAYSTACK? Anyone on the internet can POST to
 * /api/webhooks/paystack and claim "order 123 is paid". Paystack signs
 * every webhook: x-paystack-signature is the HMAC-SHA512 of the RAW request
 * body, keyed with our secret key, which only Paystack and we know. We
 * compute the same HMAC and compare.
 *
 * - RAW body: the exact bytes received. Parsing the JSON and re-serialising
 *   it could change spacing or key order, and the HMAC would no longer match.
 * - CONSTANT-TIME comparison (timingSafeEqual): a normal === stops at the
 *   first differing character, so an attacker timing many attempts could
 *   learn the signature one character at a time. This always compares
 *   every byte.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) return false
  const expected = createHmac('sha512', key).update(rawBody, 'utf8').digest()
  const received = Buffer.from(signature, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/** Paystack's test card, shown on the checkout page and the demo banner. */
export const TEST_CARD = { number: '4084 0840 8408 4081', expiry: 'any future date', cvv: '408', pin: '0000', otp: '123456' } as const
