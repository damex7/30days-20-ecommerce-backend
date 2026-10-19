// READING POSTGRESQL'S ERRORS. When the database refuses a change, the
// Neon driver throws an error carrying PostgreSQL's five-character SQLSTATE
// code and the name of the constraint that refused. The repos and services
// turn the ones we expect into ServiceErrors (lib/services/errors.ts);
// anything else is re-thrown, logged with the request id, and answered with
// a plain 500 that never contains the SQL or a stack trace.
//
// Letting the database decide, then explaining, is deliberate. "Check
// first, then write" has a gap: another request can slip in between the
// check and the write. A constraint can't be raced.
import 'server-only'

type PgError = { code?: string; constraint?: string }

function pgError(error: unknown): PgError | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as PgError
  return typeof e.code === 'string' ? e : null
}

/**
 * A delete refused because other rows still point at this one.
 *
 * Two codes: 23503 foreign_key_violation is what ON DELETE NO ACTION (the
 * default) raises; ON DELETE RESTRICT, which this schema uses, raises
 * 23001 restrict_violation instead. Both mean "history depends on it",
 * e.g. a variant that appears in an order.
 */
export function isReferencedError(error: unknown): boolean {
  const code = pgError(error)?.code
  return code === '23503' || code === '23001'
}

/** 23505: a UNIQUE constraint refused a duplicate (a SKU, a slug, a coupon code). */
export function isUniqueError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23505' && (!constraint || e.constraint === constraint)
}

/** 23514: a CHECK constraint refused a value. */
export function isCheckError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23514' && (!constraint || e.constraint === constraint)
}

/**
 * The database couldn't be REACHED at all (Neon suspended and failing to
 * wake, no network, a wrong host). These errors have no SQLSTATE: the
 * request never got as far as PostgreSQL. Pages show a friendly "we can't
 * reach the shop's database" screen and the API answers 503, which tells a
 * client "try again later", not "your request was wrong".
 */
export function isDbUnreachable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if (pgError(error)) return false
  const text = `${(error as { name?: unknown }).name ?? ''} ${(error as { message?: unknown }).message ?? ''}`
  const cause = (error as { cause?: unknown }).cause
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|WebSocket|connection terminated|Error connecting to database|DATABASE_URL is not set/i.test(text)) return true
  return cause !== undefined && cause !== error ? isDbUnreachable(cause) : false
}
