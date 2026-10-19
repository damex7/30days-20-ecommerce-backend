// AN ENDPOINT DEFINITION: everything about one route, in one object.
//
// Method, path, who may call it, the scope an API key needs, and the Zod
// schemas for its params, query, body and responses. The route handler is
// built FROM it (lib/api/handler.ts), and the OpenAPI document and the
// /docs page are generated FROM THE SAME OBJECTS (lib/api/openapi.ts), so
// the documentation can't say one thing while the code does another.
import 'server-only'

import { z } from 'zod'
import type { ApiScope } from '@/lib/services/actor'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ResponseSpec = { description: string; schema?: z.ZodType }

const none = z.object({})
type None = typeof none

export type Endpoint<P extends z.ZodType = None, Q extends z.ZodType = None, B extends z.ZodType = None> = {
  method: Method
  /** OpenAPI style: /api/v1/products/{slug} */
  path: string
  tag: string
  summary: string
  description?: string
  /** "public": anyone (credentials optional). "required": any valid credential; the service checks roles and scopes. */
  auth: 'public' | 'required' | 'paystack' | 'cron'
  /** Who can call it, for the docs and the README table. */
  who: string
  /** The API-key scope it needs, if keys may call it at all. */
  scope: ApiScope | null
  params: P
  query: Q
  body: B
  hasBody: boolean
  /** POST /orders: the Idempotency-Key header is required. */
  idempotencyKey: boolean
  /** Public GETs: Cache-Control + ETag, and 304 for If-None-Match. */
  cacheable: boolean
  responses: Record<number, ResponseSpec>
  /** A sample body for the curl example on /docs. */
  exampleBody?: unknown
  /** A sample path for "Try it" and curl, e.g. /api/v1/products/ona-loafer. */
  examplePath?: string
}

export function endpoint<P extends z.ZodType = None, Q extends z.ZodType = None, B extends z.ZodType = None>(
  def: Omit<Endpoint<P, Q, B>, 'params' | 'query' | 'body' | 'hasBody' | 'idempotencyKey' | 'cacheable' | 'scope'> & {
    params?: P
    query?: Q
    body?: B
    idempotencyKey?: boolean
    cacheable?: boolean
    scope?: ApiScope | null
  },
): Endpoint<P, Q, B> {
  return {
    ...def,
    params: (def.params ?? none) as P,
    query: (def.query ?? none) as Q,
    body: (def.body ?? none) as B,
    hasBody: def.body !== undefined,
    idempotencyKey: def.idempotencyKey ?? false,
    cacheable: def.cacheable ?? false,
    scope: def.scope ?? null,
  }
}
