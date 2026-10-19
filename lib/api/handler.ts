// THE ROUTE WRAPPER: every /api/v1 route handler is `handle(endpoint, fn)`.
//
// It keeps the route files THIN (parse, call a service, shape the answer)
// by doing everything they all need, the same way, in one place:
//
//   1. a REQUEST ID (from proxy.ts, or a new one), sent back as X-Request-Id
//      and written in the log line, so a client's bug report finds the log;
//   2. WHO is calling (cookie or API key, rate-limited per key: auth.ts);
//   3. parses params, query and JSON body with the endpoint's Zod schemas
//      (bad JSON → 400, invalid fields → 422 with an errors array);
//   4. runs the handler, which calls ONE service;
//   5. checks the response body against its schema (the docs' promise);
//   6. ETag / Cache-Control / 304 for cacheable GETs;
//   7. turns EVERY error into application/problem+json, and never lets SQL
//      or a stack trace reach the client.
import 'server-only'

import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getRequestInfo, isSameOrigin, type RequestInfo } from '@/lib/auth/request'
import { isDbUnreachable } from '@/lib/db/errors'
import { rethrowNextErrors } from '@/lib/next-errors'
import type { Actor } from '@/lib/services/actor'
import { isServiceError, type FieldIssue } from '@/lib/services/errors'
import { resolveActor, WWW_AUTHENTICATE } from './auth'
import type { Endpoint } from './endpoint'
import { etagFor, matchesIfNoneMatch } from './etag'
import { problemResponse, type Problem } from './problem'

const MAX_BODY_BYTES = 64 * 1024
const REQUEST_ID = /^[A-Za-z0-9._-]{8,80}$/

export type HandlerContext<P, Q, B> = {
  actor: Actor
  params: P
  query: Q
  body: B
  request: NextRequest
  requestId: string
  info: RequestInfo
}

export type ApiResult = {
  status: 200 | 201 | 202 | 204
  body?: unknown
  /** Location of a created resource (201). */
  location?: string
  headers?: Record<string, string>
}

export const ok = (body: unknown, headers?: Record<string, string>): ApiResult => ({ status: 200, body, headers })
export const created = (body: unknown, location: string, headers?: Record<string, string>): ApiResult => ({ status: 201, body, location, headers })
export const noContent = (): ApiResult => ({ status: 204 })

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> }

/** Zod issues → [{ field, message }], with paths like "items.0.quantity". */
export function fieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ field: issue.path.map(String).join('.') || '(body)', message: issue.message }))
}

class ProblemError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail)
  }
}

function fail(problem: Problem): never {
  throw new ProblemError(problem)
}

/** URLSearchParams → a plain object; empty values are treated as "not sent". */
function queryObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of url.searchParams) if (value !== '' && !(key in result)) result[key] = value
  return result
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/(.+\+)?json\b/i.test(type)) {
    fail({ status: 415, code: 'unsupported_media_type', detail: 'Send the body as JSON with "Content-Type: application/json".' })
  }
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) fail({ status: 413, code: 'body_too_large', detail: `Request bodies are limited to ${MAX_BODY_BYTES / 1024} KB.` })
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    fail({ status: 400, code: 'invalid_json', detail: 'The request body is not valid JSON.' })
  }
}

/** Maps anything thrown to a problem. Unexpected errors are logged with the request id and become a bare 500. */
export function toProblem(error: unknown, requestId: string): Problem {
  if (error instanceof ProblemError) return error.problem
  if (isServiceError(error)) {
    return {
      status: error.status,
      code: error.code,
      detail: error.message,
      errors: error.errors,
      extensions: error.details,
      headers: {
        ...(error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}),
        ...(error.kind === 'unauthorized' ? { 'WWW-Authenticate': WWW_AUTHENTICATE } : {}),
      },
    }
  }
  if (isDbUnreachable(error)) {
    console.error(`[api] ${requestId} database unreachable:`, error instanceof Error ? error.message : error)
    return { status: 503, code: 'database_unavailable', detail: 'We can’t reach the shop’s database right now. Please try again in a minute.', headers: { 'Retry-After': '30' } }
  }
  // The full error (with SQL or stack) goes to the SERVER log only.
  console.error(`[api] ${requestId} unexpected error:`, error)
  return { status: 500, code: 'internal_error', detail: `Something went wrong on our side. If it keeps happening, quote request id ${requestId}.` }
}

export function requestIdFrom(request: Request): string {
  const sent = request.headers.get('x-request-id')
  return sent && REQUEST_ID.test(sent) ? sent : randomUUID()
}

function actorTag(actor: Actor | null): string {
  if (!actor) return '-'
  if (actor.kind === 'user') return `user:${actor.user.id.slice(0, 8)}(${actor.user.role}${actor.user.isDemo ? ',demo' : ''})`
  if (actor.kind === 'api_key') return `key:${actor.key.prefix}`
  return actor.kind
}

export function handle<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  ep: Endpoint<P, Q, B>,
  fn: (ctx: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>) => Promise<ApiResult>,
) {
  return async function routeHandler(request: NextRequest, route: RouteContext): Promise<Response> {
    const requestId = requestIdFrom(request)
    const started = performance.now()
    const url = new URL(request.url)
    let actor: Actor | null = null
    let response: Response

    try {
      const info = await getRequestInfo()
      actor = await resolveActor(request, info.ip)

      // CSRF, for COOKIE-authenticated writes. A browser attaches the
      // session cookie to requests from any site, so a page elsewhere must
      // not be able to make a signed-in customer's browser place an order.
      // Three layers: the cookie is SameSite=Lax (not sent on cross-site
      // POSTs), bodies must be application/json (a plain HTML form can't
      // send that, and a script on another site would need CORS, which we
      // never grant), and here, a browser's Origin header must be ours.
      // API keys aren't sent automatically by browsers, so they need none of this.
      if (actor.kind === 'user' && !['GET', 'HEAD'].includes(request.method) && request.headers.has('origin') && !isSameOrigin(request)) {
        fail({ status: 403, code: 'cross_origin', detail: 'Requests that use the session cookie must come from this site.' })
      }

      if (ep.auth === 'required' && actor.kind === 'anonymous') {
        fail({ status: 401, code: 'unauthorized', detail: 'Sign in, or send an API key in the Authorization header.', headers: { 'WWW-Authenticate': WWW_AUTHENTICATE } })
      }

      // A path segment that doesn't fit (/orders/abc) names nothing: 404.
      const params = ep.params.safeParse(await route.params)
      if (!params.success) fail({ status: 404, code: 'not_found', detail: 'Nothing exists at this address.' })

      const query = ep.query.safeParse(queryObject(url))
      if (!query.success) fail({ status: 422, code: 'validation_failed', detail: 'Some query parameters are invalid.', errors: fieldIssues(query.error) })

      let body: z.output<B> = undefined as z.output<B>
      if (ep.hasBody) {
        const parsed = ep.body.safeParse(await readJsonBody(request))
        if (!parsed.success) fail({ status: 422, code: 'validation_failed', detail: 'Please fix the fields listed in errors.', errors: fieldIssues(parsed.error) })
        body = parsed.data
      }

      const result = await fn({ actor, params: params.data, query: query.data, body, request, requestId, info })
      response = buildResponse(ep, result, request, actor, requestId)
    } catch (error) {
      rethrowNextErrors(error)
      response = problemResponse(toProblem(error, requestId), requestId, url.pathname)
    }

    const ms = Math.round(performance.now() - started)
    console.log(`[api] ${requestId} ${request.method} ${url.pathname}${url.search} ${response.status} ${ms}ms ${actorTag(actor)}`)
    return response
  }
}

function buildResponse(ep: Endpoint<z.ZodType, z.ZodType, z.ZodType>, result: ApiResult, request: NextRequest, actor: Actor, requestId: string): Response {
  const headers = new Headers({ 'X-Request-Id': requestId, ...(result.headers ?? {}) })
  if (result.location) headers.set('Location', result.location)
  if (result.status === 204) return new Response(null, { status: 204, headers })

  // THE RESPONSE IS CHECKED AGAINST ITS SCHEMA before it goes out. A mismatch
  // is OUR bug: it's logged and answered 500, rather than sending clients a
  // shape the docs don't describe.
  const spec = ep.responses[result.status]
  const checked = spec?.schema ? spec.schema.parse(result.body) : result.body
  const json = JSON.stringify(checked)
  headers.set('Content-Type', 'application/json; charset=utf-8')

  if (ep.cacheable && request.method === 'GET' && result.status === 200) {
    const etag = etagFor(json)
    headers.set('ETag', etag)
    // Anonymous answers are the same for everyone: any cache may keep them
    // for a minute. Anything tied to credentials is private to that caller.
    headers.set('Cache-Control', actor.kind === 'anonymous' ? 'public, max-age=60, stale-while-revalidate=300' : 'private, max-age=0, must-revalidate')
    headers.set('Vary', 'Authorization, Cookie')
    if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers })
    }
  } else if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store')
  }
  return new Response(json, { status: result.status, headers })
}
