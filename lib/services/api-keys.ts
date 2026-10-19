// API KEYS: create (shown once), list (prefix only), revoke, authenticate.
//
// SESSION COOKIE OR API KEY? Two kinds of credential for two kinds of caller:
//   - The SESSION COOKIE is for a PERSON: the storefront, my admin pages,
//     a customer's mobile app after they log in. It is tied to a user and
//     their role, expires, is HttpOnly (JavaScript can't read it) and
//     SameSite, so the browser itself guards it against CSRF.
//   - An API KEY is for a PROGRAM: a courier's system updating deliveries,
//     a stock sync, a nightly export. No person logs in; the key is set once
//     in that system's configuration and sent as Authorization: Bearer.
//     It has SCOPES (exactly what it may do) rather than a role, can be
//     revoked on its own without touching anyone's account, and its
//     requests are counted per key for rate limiting.
import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { http } from '@/lib/db/executor'
import * as repo from '@/lib/repos/api-keys'
import type { ApiKeyRow } from '@/lib/repos/api-keys'
import type { Actor, ApiKeyPrincipal, ApiScope } from './actor'
import { notFound } from './errors'
import { authorize } from './permissions'

const PREFIX = 'oja_live_'
const KEY_PATTERN = /^oja_live_[A-Za-z0-9_-]{43}$/

/** SHA-256 in hex. Fast on purpose: see db/migrations/011_api_keys.sql for why that's safe here. */
export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/** A new secret: "oja_live_" + 32 random bytes in base64url (43 characters, 256 bits). */
export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const secret = `${PREFIX}${randomBytes(32).toString('base64url')}`
  return { secret, prefix: secret.slice(0, PREFIX.length + 6), hash: hashApiKey(secret) }
}

export function looksLikeApiKey(value: string): boolean {
  return KEY_PATTERN.test(value)
}

/**
 * Who is this key? null if it's malformed, unknown, revoked or expired.
 * A malformed value never reaches the database.
 */
export async function authenticateApiKey(secret: string): Promise<ApiKeyPrincipal | null> {
  if (!looksLikeApiKey(secret)) return null
  const row = await repo.findUsableApiKeyByHash(http, hashApiKey(secret))
  return row ? { id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes, isDemo: row.isDemo } : null
}

export async function listApiKeys(actor: Actor): Promise<ApiKeyRow[]> {
  authorize(actor, 'api_keys.read')
  return repo.listApiKeys(http)
}

/**
 * Creates a key and returns the SECRET exactly once. It's never stored,
 * so it can never be shown again: lose it and you revoke it and make a new one.
 */
export async function createApiKey(actor: Actor, input: { name: string; scopes: ApiScope[]; expiresAt: Date | null }): Promise<{ key: ApiKeyRow; secret: string }> {
  authorize(actor, 'api_keys.manage')
  if (actor.kind !== 'user') throw new Error('api-keys: only a person can create keys')
  const { secret, prefix, hash } = generateApiKey()
  const id = await repo.insertApiKey(http, { name: input.name, prefix, keyHash: hash, scopes: [...new Set(input.scopes)], createdBy: actor.user.id, expiresAt: input.expiresAt })
  const key = await repo.findApiKey(http, id)
  if (!key) throw new Error('createApiKey: the new key vanished')
  return { key, secret }
}

export async function revokeApiKey(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'api_keys.manage')
  if (!(await repo.revokeApiKey(http, id))) throw notFound('API key')
}
