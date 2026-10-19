// ONE ERROR FORMAT: application/problem+json (RFC 9457).
//
// Every /api/v1 error, whatever went wrong, looks like this:
//
//   HTTP/1.1 422 Unprocessable Content
//   Content-Type: application/problem+json
//   X-Request-Id: 7f9c2e1a-…
//
//   { "type": "https://oja.example/docs#problem-validation_failed",
//     "title": "Your request has invalid fields",
//     "status": 422,
//     "detail": "Please fix the fields listed in errors.",
//     "request_id": "7f9c2e1a-…",
//     "errors": [{ "field": "price_kobo", "message": "Too small: expected number to be >=0" }] }
//
// A client can rely on `status` and `type` to decide what to do, show
// `detail` to a person, and put `errors` under the matching fields.
// `request_id` is also in the server log line for that request, so a bug
// report quoting it leads straight to what happened.
//
// NEVER LEAKED: SQL, constraint names, stack traces, file paths. An
// unexpected error is logged in full on the server and answered with a
// plain 500 that only carries the request id.
import 'server-only'

import { appUrl } from '@/lib/auth/email'
import type { FieldIssue } from '@/lib/services/errors'

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication required',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict with the current state',
  413: 'Request body too large',
  415: 'Unsupported content type',
  422: 'Your request has invalid fields',
  429: 'Too many requests',
  500: 'Something went wrong on our side',
  503: 'Service temporarily unavailable',
}

export type Problem = {
  status: number
  code: string
  detail: string
  errors?: FieldIssue[]
  /** Extra members (RFC 9457 "extensions"), e.g. short_items, current_version. */
  extensions?: Record<string, unknown>
  headers?: Record<string, string>
}

export function problemTypeUri(code: string): string {
  return appUrl(`/docs#problem-${code}`)
}

export function problemResponse(problem: Problem, requestId: string, instance?: string): Response {
  const body = {
    type: problemTypeUri(problem.code),
    title: TITLES[problem.status] ?? 'Error',
    status: problem.status,
    detail: problem.detail,
    ...(instance ? { instance } : {}),
    request_id: requestId,
    ...(problem.errors && problem.errors.length > 0 ? { errors: problem.errors } : {}),
    ...(problem.extensions ?? {}),
  }
  return new Response(JSON.stringify(body), {
    status: problem.status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      ...(problem.headers ?? {}),
    },
  })
}
