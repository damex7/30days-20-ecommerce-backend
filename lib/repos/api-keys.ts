// API KEYS: SQL only. Creating the secret and hashing it is the service's
// job (lib/services/api-keys.ts); this file never sees a plaintext key.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { API_SCOPES } from '@/lib/services/actor'

export const ApiKeyRow = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.enum(API_SCOPES)),
  isDemo: z.boolean(),
  createdById: z.uuid(),
  createdByName: z.string(),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
})
export type ApiKeyRow = z.infer<typeof ApiKeyRow>

const columns = q`
  k.id, k.name, k.prefix, k.scopes, k.is_demo AS "isDemo", k.created_by AS "createdById", u.name AS "createdByName",
  k.last_used_at AS "lastUsedAt", k.expires_at AS "expiresAt", k.revoked_at AS "revokedAt", k.created_at AS "createdAt"`

export function listApiKeys(db: Db): Promise<ApiKeyRow[]> {
  return rows(db, ApiKeyRow, q`SELECT ${columns} FROM api_keys k JOIN users u ON u.id = k.created_by ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`, 'listApiKeys')
}

export function findApiKey(db: Db, id: string): Promise<ApiKeyRow | null> {
  return one(db, ApiKeyRow, q`SELECT ${columns} FROM api_keys k JOIN users u ON u.id = k.created_by WHERE k.id = ${id}`, 'findApiKey')
}

/**
 * THE LOOKUP ON EVERY API REQUEST: by hash, through the UNIQUE index.
 * Only usable keys match: not revoked, not expired.
 *
 * In the same statement, last_used_at is bumped, but at most once a minute
 * per key, so a busy integration doesn't turn every read into a write.
 */
export function findUsableApiKeyByHash(db: Db, keyHash: string): Promise<ApiKeyRow | null> {
  return one(
    db,
    ApiKeyRow,
    q`WITH found AS (
        SELECT * FROM api_keys
        WHERE key_hash = ${keyHash} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      ), touched AS (
        UPDATE api_keys SET last_used_at = now()
        WHERE id IN (SELECT id FROM found) AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
      )
      SELECT ${columns} FROM found k JOIN users u ON u.id = k.created_by`,
    'findUsableApiKeyByHash',
  )
}

export async function insertApiKey(
  db: Db,
  input: { name: string; prefix: string; keyHash: string; scopes: string[]; createdBy: string; expiresAt: Date | null; isDemo?: boolean },
): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO api_keys (name, prefix, key_hash, scopes, created_by, expires_at, is_demo)
      VALUES (${input.name}, ${input.prefix}, ${input.keyHash}, ${input.scopes}::text[], ${input.createdBy}, ${input.expiresAt}, ${input.isDemo ?? false})
      RETURNING id`,
    'insertApiKey',
  )
  return result[0]!.id
}

/** Revoking keeps the row (order events still name the key). false = unknown or already revoked. */
export async function revokeApiKey(db: Db, id: string): Promise<boolean> {
  const result = await db.query(q`UPDATE api_keys SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL RETURNING id`)
  return result.length > 0
}
