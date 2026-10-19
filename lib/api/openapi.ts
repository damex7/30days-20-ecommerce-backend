// THE OPENAPI 3.1 DOCUMENT, generated from lib/api/endpoints.ts.
//
// No library: Zod 4 has z.toJSONSchema() built in, and OpenAPI 3.1 uses
// plain JSON Schema (draft 2020-12) for its schemas, so each endpoint's
// Zod schemas convert directly. Request schemas are converted as INPUT
// (what a client sends, before our transforms turn snake_case into
// camelCase); responses as OUTPUT. Served at /api/v1/openapi.json and
// rendered by /docs.
import 'server-only'

import { z } from 'zod'
import { appUrl } from '@/lib/auth/email'
import { SESSION_COOKIE } from '@/lib/auth/cookie'
import type { Endpoint } from './endpoint'
import { endpoints } from './endpoints'
import { NIGERIAN_STATES } from './requests'

type JsonSchema = Record<string, unknown>
type AnyEndpoint = Endpoint<z.ZodType, z.ZodType, z.ZodType>

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io, unrepresentable: 'any' }) as JsonSchema
  delete json.$schema
  return json
}

function pathParameters(ep: AnyEndpoint) {
  return [...ep.path.matchAll(/\{(\w+)\}/g)].map(([, name = '']) => {
    const uuid = name === 'id' && /\/(users|api-keys)\//.test(ep.path)
    const schema: JsonSchema =
      name === 'state' ? { type: 'string', enum: [...NIGERIAN_STATES] } : name === 'slug' ? { type: 'string', pattern: '^[a-z0-9-]+$' } : uuid ? { type: 'string', format: 'uuid' } : { type: 'integer', minimum: 1 }
    return { name, in: 'path', required: true, schema }
  })
}

function queryParameters(ep: AnyEndpoint) {
  const json = schemaOf(ep.query, 'input')
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((json.required as string[] | undefined) ?? [])
  return Object.entries(properties).map(([name, schema]) => {
    const { description, ...rest } = schema
    return { name, in: 'query', required: required.has(name) && !('default' in schema), ...(description ? { description } : {}), schema: rest }
  })
}

function security(ep: AnyEndpoint) {
  switch (ep.auth) {
    case 'public':
      // Credentials are optional: {} means "none is fine too".
      return [{}, { cookieAuth: [] }, ...(ep.scope ? [{ bearerAuth: [ep.scope] }] : [])]
    case 'required':
      return [{ cookieAuth: [] }, ...(ep.scope ? [{ bearerAuth: [ep.scope] }] : [])]
    case 'paystack':
      return [{ paystackSignature: [] }]
    case 'cron':
      return [{ cronSecret: [] }]
  }
}

function operation(name: string, ep: AnyEndpoint) {
  const parameters: unknown[] = [...pathParameters(ep), ...queryParameters(ep)]
  if (ep.idempotencyKey) {
    parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, description: 'A new random value (e.g. a UUID) for each distinct order. Retry with the SAME key to get the same order back.', schema: { type: 'string', minLength: 8, maxLength: 255 } })
  }
  if (ep.cacheable) {
    parameters.push({ name: 'If-None-Match', in: 'header', required: false, description: 'The ETag you have; answered 304 if unchanged.', schema: { type: 'string' } })
  }

  const responses: Record<string, unknown> = {}
  for (const [status, spec] of Object.entries(ep.responses)) {
    const code = Number(status)
    const headers: Record<string, unknown> = { 'X-Request-Id': { description: 'Also in the server log for this request.', schema: { type: 'string' } } }
    if (code === 201) headers.Location = { description: 'The new resource', schema: { type: 'string' } }
    if (code === 429) headers['Retry-After'] = { description: 'Seconds to wait', schema: { type: 'integer' } }
    if (code === 200 && ep.cacheable) {
      headers.ETag = { schema: { type: 'string' } }
      headers['Cache-Control'] = { schema: { type: 'string' } }
    }
    responses[status] = {
      description: spec.description,
      headers,
      ...(spec.schema ? { content: { [code >= 400 ? 'application/problem+json' : 'application/json']: { schema: schemaOf(spec.schema, 'output') } } } : {}),
    }
  }

  return {
    operationId: name,
    summary: ep.summary,
    description: [ep.description, `**Who:** ${ep.who}.`, ep.scope ? `**API-key scope:** \`${ep.scope}\`.` : '**API keys:** not accepted.'].filter(Boolean).join('\n\n'),
    tags: [ep.tag],
    security: security(ep),
    'x-who': ep.who,
    'x-scope': ep.scope,
    ...(ep.examplePath ? { 'x-example-path': ep.examplePath } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(ep.hasBody ? { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(ep.body, 'input'), ...(ep.exampleBody ? { example: ep.exampleBody } : {}) } } } } : {}),
    responses,
  }
}

let cached: Record<string, unknown> | null = null

export function buildOpenApi(): Record<string, unknown> {
  if (cached) return cached
  const paths: Record<string, Record<string, unknown>> = {}
  for (const [name, ep] of Object.entries(endpoints) as [string, AnyEndpoint][]) {
    paths[ep.path] ??= {}
    paths[ep.path]![ep.method.toLowerCase()] = operation(name, ep)
  }
  cached = {
    openapi: '3.1.0',
    info: {
      title: 'Ọjà API',
      version: '1.0.0',
      summary: 'Products, carts, orders and payments for an Aba leather-goods shop.',
      description:
        'JSON in snake_case. Money is integer kobo with currency "NGN". Lists use cursor pagination (limit, cursor → next_cursor). Errors are application/problem+json (RFC 9457). Every response carries X-Request-Id.',
    },
    servers: [{ url: appUrl('') }],
    tags: [
      { name: 'Auth' }, { name: 'Me' }, { name: 'Catalogue' }, { name: 'Cart' }, { name: 'Addresses' },
      { name: 'Delivery fees' }, { name: 'Orders' }, { name: 'Admin' }, { name: 'Meta' },
    ],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE, description: 'The session cookie set by POST /api/v1/auth/login (or the website’s login page).' },
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key: Authorization: Bearer oja_live_… Each endpoint names the scope it needs.' },
        paystackSignature: { type: 'apiKey', in: 'header', name: 'x-paystack-signature', description: 'HMAC-SHA512 of the raw body, keyed with the Paystack secret key.' },
        cronSecret: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer $CRON_SECRET (sent by Vercel Cron).' },
      },
    },
  }
  return cached
}
