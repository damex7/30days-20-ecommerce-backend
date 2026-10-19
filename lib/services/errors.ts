// SERVICE ERRORS: how the business rules say "no".
//
// A service never builds an HTTP response; it throws one of these. The two
// transports translate them:
//   - the REST API (lib/api/handler.ts) → application/problem+json with the
//     matching status code;
//   - Server Actions → a FormState message under the right field.
// So the rule "a stale version is a conflict" is written once, and both
// the mobile app and the admin page hear about it the same way.
//
// 409 OR 422? Both mean "understood, but no".
//   422 Unprocessable Content: the request itself is wrong for this
//       operation: a field fails validation, the coupon's minimum isn't
//       met, an Idempotency-Key was reused with a different body. Sending
//       the same thing again will always fail; the CLIENT must change it.
//   409 Conflict: the request was fine but clashes with the resource's
//       CURRENT STATE: someone else saved first (stale version), the order
//       has already shipped, the last pair just sold. Re-reading the
//       resource and trying again may well succeed.
import 'server-only'

export type FieldIssue = { field: string; message: string }

export type ServiceErrorKind =
  | 'bad_request' // 400: malformed (bad JSON, a missing required header)
  | 'unauthorized' // 401: no valid credentials
  | 'forbidden' // 403: valid credentials, not allowed (role, scope, read-only demo)
  | 'not_found' // 404: doesn't exist, OR isn't yours (see ownership in the README)
  | 'conflict' // 409: clashes with the current state
  | 'invalid' // 422: validation / business-rule failure on the input
  | 'rate_limited' // 429: too many requests; retryAfterSeconds says when to come back
  | 'unavailable' // 503: the database or Paystack can't be reached

export const STATUS_FOR: Record<ServiceErrorKind, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
  rate_limited: 429,
  unavailable: 503,
}

export type ServiceErrorOptions = {
  /** Field-level problems (validation), shown under each field. */
  errors?: FieldIssue[]
  /** Extra machine-readable details, e.g. which items are short, the current version. */
  details?: Record<string, unknown>
  retryAfterSeconds?: number
}

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind
  /** A stable machine-readable code, e.g. "out_of_stock". Becomes the problem "type". */
  readonly code: string
  readonly errors: FieldIssue[]
  readonly details: Record<string, unknown>
  readonly retryAfterSeconds: number | undefined

  constructor(kind: ServiceErrorKind, code: string, message: string, options: ServiceErrorOptions = {}) {
    super(message)
    this.name = 'ServiceError'
    this.kind = kind
    this.code = code
    this.errors = options.errors ?? []
    this.details = options.details ?? {}
    this.retryAfterSeconds = options.retryAfterSeconds
  }

  get status(): number {
    return STATUS_FOR[this.kind]
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

// Short constructors, so services read like the rules they enforce.

export const notFound = (what: string) => new ServiceError('not_found', 'not_found', `${what} was not found.`)

export const unauthorized = (message = 'Sign in, or send an API key in the Authorization header.') =>
  new ServiceError('unauthorized', 'unauthorized', message)

export const forbidden = (code: string, message: string) => new ServiceError('forbidden', code, message)

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceError('conflict', code, message, { details })

export const invalid = (code: string, message: string, errors: FieldIssue[] = [], details?: Record<string, unknown>) =>
  new ServiceError('invalid', code, message, { errors, details })

export const badRequest = (code: string, message: string) => new ServiceError('bad_request', code, message)

/** The optimistic-concurrency answer: someone saved first. */
export const staleVersion = (what: string, currentVersion: number | null) =>
  conflict('stale_version', `This ${what} was changed by someone else since you loaded it. Reload it and try again.`, {
    current_version: currentVersion,
  })

/** The one message every refused demo write uses (see lib/services/permissions.ts). */
export const DEMO_READ_ONLY_MESSAGE = 'This is a read-only demo. You can look around, but changes are switched off for demo staff and admin accounts.'
