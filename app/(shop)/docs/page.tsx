// /docs: the API reference, built HERE from the OpenAPI document (no
// Swagger UI). The document itself is generated from the same Zod schemas
// the routes validate with (lib/api/openapi.ts), so this page can't
// describe an API that doesn't exist.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { MethodBadge } from '@/components/docs/method-badge'
import { TryIt } from '@/components/docs/try-it'
import { CopyButton } from '@/components/ui/copy-button'
import { Notice } from '@/components/ui/notice'
import { appUrl } from '@/lib/auth/email'
import { buildOpenApi } from '@/lib/api/openapi'
import { isDemoMode } from '@/lib/services/demo'

export const metadata: Metadata = { title: 'API reference', description: 'The Ọjà REST API: products, carts, orders and payments, as JSON.' }

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; description?: string; enum?: unknown[]; anyOf?: Schema[]; oneOf?: Schema[]; const?: unknown; format?: string; default?: unknown; minimum?: number; maximum?: number }
type Operation = {
  operationId: string
  summary: string
  description?: string
  tags: string[]
  'x-who': string
  'x-scope': string | null
  'x-example-path'?: string
  parameters?: { name: string; in: string; required?: boolean; description?: string; schema: Schema }[]
  requestBody?: { content: Record<string, { schema: Schema; example?: unknown }> }
  responses: Record<string, { description: string }>
}

/** A short, readable type for a JSON schema: "integer", "string (uuid)", "array of object", "\"a\" | \"b\"". */
function typeOf(s: Schema | undefined): string {
  if (!s) return 'any'
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (s.const !== undefined) return JSON.stringify(s.const)
  const union = s.anyOf ?? s.oneOf
  if (union) return union.map(typeOf).join(' | ')
  const t = Array.isArray(s.type) ? s.type.join(' | ') : (s.type ?? 'object')
  if (t === 'array') return `array of ${typeOf(s.items)}`
  return s.format ? `${t} (${s.format})` : t
}

function SchemaTable({ schema, caption }: { schema: Schema; caption: string }) {
  const props = Object.entries(schema.properties ?? {})
  if (props.length === 0) return <p className="text-sm text-muted">No fields.</p>
  const required = new Set(schema.required ?? [])
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Field</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Type</th>
            <th scope="col" className="py-1.5 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-line align-top">
          {props.map(([name, p]) => (
            <tr key={name}>
              <th scope="row" className="py-1.5 pr-3 font-mono text-xs font-bold whitespace-nowrap text-link">
                {name}
                {required.has(name) && p.default === undefined ? <span className="text-danger" title="required"> *</span> : null}
              </th>
              <td className="py-1.5 pr-3 font-mono text-xs">{typeOf(p)}</td>
              <td className="py-1.5 text-xs text-muted">{p.description ?? (p.default !== undefined ? `Default ${JSON.stringify(p.default)}` : '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function curlFor(method: string, path: string, op: Operation): string {
  const url = appUrl(path)
  const lines = [`curl -i${method === 'GET' ? '' : ` -X ${method}`} "${url}"`]
  if (op['x-scope']) lines.push(`  -H "Authorization: Bearer $OJA_API_KEY"`)
  else if (op['x-who'].match(/Customer|Owner|Session|Admin|Staff/)) lines.push(`  -b cookies.txt   # session cookie from POST /api/v1/auth/login with -c cookies.txt`)
  const example = op.requestBody?.content['application/json']?.example
  if (op.parameters?.some((p) => p.name === 'Idempotency-Key')) lines.push(`  -H "Idempotency-Key: $(uuidgen)"`)
  if (example !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`)
    lines.push(`  -d '${JSON.stringify(example)}'`)
  }
  return lines.join(' \\\n')
}

const PROBLEMS: [string, string][] = [
  ['validation_failed', '422: one or more fields are invalid; see errors[] for each field and message.'],
  ['invalid_json', '400: the body is not valid JSON.'],
  ['unsupported_media_type', '415: send Content-Type: application/json.'],
  ['body_too_large', '413: bodies are limited to 64 KB.'],
  ['invalid_cursor', '400: use next_cursor from the previous page, unchanged.'],
  ['cursor_mismatch', '400: that cursor belongs to a list with other filters or another sort.'],
  ['unauthorized', '401: sign in, or send a valid API key.'],
  ['invalid_credentials', '401: email or password is wrong (the same answer either way).'],
  ['missing_scope', '403: the API key lacks the scope this endpoint needs.'],
  ['session_required', '403: API keys can’t do this; it needs a signed-in person.'],
  ['wrong_role', '403: your role can’t do this.'],
  ['demo_read_only', '403: demo staff and admin accounts can look but not change anything.'],
  ['cross_origin', '403: a cookie-authenticated write came from another site.'],
  ['email_not_verified', '403: confirm your email address first.'],
  ['not_found', '404: it doesn’t exist, or it isn’t yours (the same answer on purpose).'],
  ['stale_version', '409: someone saved a newer version since you read it; current_version says which.'],
  ['invalid_transition', '409: that status move isn’t in the state machine; allowed_next lists the moves that are.'],
  ['out_of_stock', '409: some items ran out; short_items lists each with what’s available. Nothing was reserved or charged.'],
  ['insufficient_stock', '409: not that many on the shelf.'],
  ['cart_empty', '409: there is nothing in the cart to order.'],
  ['has_orders', '409: it appears in orders, so archive it instead of deleting.'],
  ['idempotency_in_progress', '409: the first request with this key is still running; retry with the same key shortly.'],
  ['idempotency_key_reused', '422: this key was used with a different body; use a new key for a new request.'],
  ['idempotency_key_required', '400: POST /orders needs an Idempotency-Key header.'],
  ['coupon_expired', '422: the code’s end date has passed.'],
  ['coupon_used_up', '422: the code has reached its maximum uses.'],
  ['coupon_minimum_not_met', '422: the subtotal is below the code’s minimum.'],
  ['coupon_customer_limit', '422: you’ve already used this code as often as allowed.'],
  ['coupon_unknown', '422: no code by that name.'],
  ['rate_limited', '429: too many requests; wait Retry-After seconds.'],
  ['database_unavailable', '503: the database can’t be reached; try again shortly (Retry-After).'],
  ['payments_not_configured', '503: Paystack keys aren’t set on this server.'],
  ['internal_error', '500: our bug. Quote request_id when you report it.'],
]

export default function DocsPage() {
  const doc = buildOpenApi() as { paths: Record<string, Record<string, Operation>>; tags: { name: string }[] }
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method: method.toUpperCase(), op })))
  const tags = doc.tags.map((t) => t.name).filter((t) => ops.some((o) => o.op.tags.includes(t)))
  const anchor = (id: string) => `op-${id}`

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
      <nav aria-label="API sections" className="self-start lg:sticky lg:top-4">
        <details className="rounded-card border border-line bg-raised p-3 shadow-card lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" open>
          <summary className="min-h-10 cursor-pointer content-center font-display text-lg font-bold">Contents</summary>
          <ul className="mt-2 space-y-3 text-sm">
            <li>
              <a href="#basics" className="link">The basics</a>
            </li>
            {tags.map((tag) => (
              <li key={tag}>
                <a href={`#tag-${tag.replace(/\s+/g, '-')}`} className="font-semibold text-ink">
                  {tag}
                </a>
                <ul className="mt-1 space-y-1 border-l border-line pl-3">
                  {ops
                    .filter((o) => o.op.tags.includes(tag))
                    .map((o) => (
                      <li key={o.op.operationId}>
                        <a href={`#${anchor(o.op.operationId)}`} className="flex items-baseline gap-1.5 text-muted no-underline hover:text-ink hover:underline">
                          <span className="w-12 shrink-0 font-mono text-[0.65rem] font-bold">{o.method}</span>
                          <span className="truncate">{o.op.summary}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
            <li>
              <a href="#errors" className="link">Error types</a>
            </li>
          </ul>
        </details>
      </nav>

      <div className="min-w-0 space-y-10">
        <header>
          <p className="stamp text-link">REST · JSON · v1</p>
          <h1 className="mt-1 text-5xl">Ọjà API</h1>
          <p className="mt-3 max-w-3xl text-lg text-muted">
            The same rules as this website, for a phone app, a courier’s system or a spreadsheet. Generated from the code:{' '}
            <a href="/api/v1/openapi.json" className="link">openapi.json</a> (OpenAPI 3.1).
          </p>
        </header>

        <Suspense fallback={null}>
          <DemoNote />
        </Suspense>

        <section id="basics" aria-labelledby="basics-title" className="space-y-4 rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <h2 id="basics-title" className="text-3xl">
            The basics
          </h2>
          <dl className="grid gap-x-6 gap-y-3 text-[0.95rem] md:grid-cols-[11rem_1fr]">
            <dt className="font-bold">Base URL</dt>
            <dd className="font-mono text-sm break-all">{appUrl('/api/v1')}</dd>
            <dt className="font-bold">Credentials</dt>
            <dd>
              A <strong>session cookie</strong> for people (from <code>POST /auth/login</code>, or signing in on this site) or an <strong>API key</strong> for
              programs: <code>Authorization: Bearer oja_live_…</code>, each with scopes (<code>catalog:read</code>, <code>catalog:write</code>,{' '}
              <code>orders:read</code>, <code>orders:write</code>). Every endpoint below says who may call it and which scope it needs.
            </dd>
            <dt className="font-bold">JSON</dt>
            <dd>
              snake_case everywhere. Money is an integer in <strong>kobo</strong> (₦1 = 100 kobo) with <code>&quot;currency&quot;: &quot;NGN&quot;</code>; times
              are ISO 8601 in UTC.
            </dd>
            <dt className="font-bold">Lists</dt>
            <dd>
              Cursor pagination: <code>?limit=24</code>, then pass <code>next_cursor</code> back as <code>?cursor=…</code>. <code>next_cursor: null</code> means
              the last page. There are no page numbers, on purpose: pages don’t shift when new orders arrive.
            </dd>
            <dt className="font-bold">Changing things</dt>
            <dd>
              PATCH bodies carry the <code>version</code> you read; if someone saved first you get <code>409 stale_version</code>. <code>POST /orders</code>{' '}
              needs an <code>Idempotency-Key</code> header: retrying with the same key returns the same order.
            </dd>
            <dt className="font-bold">Caching</dt>
            <dd>
              Public catalogue GETs send <code>ETag</code> and <code>Cache-Control</code>; send <code>If-None-Match</code> and get <code>304</code> with no
              body when nothing changed.
            </dd>
            <dt className="font-bold">Errors</dt>
            <dd>
              <code>application/problem+json</code> (RFC 9457) with <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>,{' '}
              <code>request_id</code> and, for validation, <code>errors[]</code>. Every response has an <code>X-Request-Id</code> header.
            </dd>
            <dt className="font-bold">Limits</dt>
            <dd>
              120 requests a minute per API key; login, sign-up and placing orders have their own limits. Over a limit: <code>429</code> with{' '}
              <code>Retry-After</code>.
            </dd>
          </dl>
          <pre className="relative overflow-x-auto rounded-control bg-link-soft p-4 text-xs text-ink">{`HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json
X-Request-Id: 2f7c1a9e-5b1d-4c9a-9f0e-8d6b3a1c4e77

{
  "type": "${appUrl('/docs#problem-validation_failed')}",
  "title": "Your request has invalid fields",
  "status": 422,
  "detail": "Please fix the fields listed in errors.",
  "instance": "/api/v1/cart/items",
  "request_id": "2f7c1a9e-5b1d-4c9a-9f0e-8d6b3a1c4e77",
  "errors": [{ "field": "quantity", "message": "You can buy up to 20 of one item" }]
}`}</pre>
        </section>

        {tags.map((tag) => (
          <section key={tag} id={`tag-${tag.replace(/\s+/g, '-')}`} aria-labelledby={`tag-${tag.replace(/\s+/g, '-')}-title`} className="space-y-4">
            <h2 id={`tag-${tag.replace(/\s+/g, '-')}-title`} className="text-3xl">
              {tag}
            </h2>
            {ops
              .filter((o) => o.op.tags.includes(tag))
              .map(({ path, method, op }) => {
                const body = op.requestBody?.content['application/json']
                const query = (op.parameters ?? []).filter((p) => p.in === 'query')
                const headers = (op.parameters ?? []).filter((p) => p.in === 'header')
                const curl = curlFor(method, op['x-example-path'] ?? path, op)
                return (
                  <article key={op.operationId} id={anchor(op.operationId)} aria-labelledby={`${anchor(op.operationId)}-title`} className="scroll-mt-4 rounded-card border border-line bg-raised p-4 shadow-card sm:p-6">
                    <h3 id={`${anchor(op.operationId)}-title`} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-base">
                      <MethodBadge method={method} />
                      <code className="text-sm font-bold break-all">{path}</code>
                    </h3>
                    <p className="mt-2 font-display text-xl font-bold">{op.summary}</p>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">Who:</span> {op['x-who']}
                      {op['x-scope'] ? (
                        <>
                          {' '}
                          · <span className="font-semibold">Scope:</span> <code className="text-link">{op['x-scope']}</code>
                        </>
                      ) : null}
                    </p>
                    {op.description ? <p className="mt-2 text-[0.95rem] text-muted">{op.description.split('\n\n')[0]}</p> : null}

                    {query.length > 0 ? (
                      <div className="mt-4">
                        <h4 className="mb-1 text-sm font-bold">Query parameters</h4>
                        <SchemaTable caption={`Query parameters of ${method} ${path}`} schema={{ properties: Object.fromEntries(query.map((p) => [p.name, { ...p.schema, description: p.description }])), required: query.filter((p) => p.required).map((p) => p.name) }} />
                      </div>
                    ) : null}
                    {headers.length > 0 ? (
                      <div className="mt-4">
                        <h4 className="mb-1 text-sm font-bold">Headers</h4>
                        <SchemaTable caption={`Headers of ${method} ${path}`} schema={{ properties: Object.fromEntries(headers.map((p) => [p.name, { ...p.schema, description: p.description }])), required: headers.filter((p) => p.required).map((p) => p.name) }} />
                      </div>
                    ) : null}
                    {body ? (
                      <div className="mt-4">
                        <h4 className="mb-1 text-sm font-bold">JSON body</h4>
                        <SchemaTable caption={`Body of ${method} ${path}`} schema={body.schema} />
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <h4 className="mb-1 text-sm font-bold">Responses</h4>
                      <ul className="flex flex-wrap gap-1.5">
                        {Object.entries(op.responses).map(([status, r]) => (
                          <li key={status} title={r.description} className={`rounded-control border px-2 py-0.5 font-mono text-xs ${Number(status) >= 400 ? 'border-danger text-danger' : 'border-success text-success'}`}>
                            {status} <span className="font-sans">{r.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {method === 'GET' && path.startsWith('/api/v1/') ? (
                      <Suspense fallback={null}>
                        <TryItForDemo path={op['x-example-path'] ?? path} />
                      </Suspense>
                    ) : (
                      <div className="mt-4">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-bold">Example</h4>
                          <CopyButton text={curl} label="Copy curl" small />
                        </div>
                        <pre className="relative overflow-x-auto rounded-control bg-link-soft p-3 text-xs">{curl}</pre>
                      </div>
                    )}
                  </article>
                )
              })}
          </section>
        ))}

        <section id="errors" aria-labelledby="errors-title" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <h2 id="errors-title" className="text-3xl">
            Error types
          </h2>
          <p className="mt-2 text-muted">
            Each problem’s <code>type</code> links here. <strong>409 or 422?</strong> 422 means the request itself is wrong for this operation (fix the input);
            409 means it clashes with the resource’s current state (re-read it and try again).
          </p>
          <dl className="mt-4 divide-y divide-dashed divide-line">
            {PROBLEMS.map(([code, text]) => (
              <div key={code} id={`problem-${code}`} className="grid scroll-mt-4 gap-1 py-2 sm:grid-cols-[16rem_1fr]">
                <dt className="font-mono text-sm font-bold text-link">{code}</dt>
                <dd className="text-sm">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            <Link href="/" className="link">Back to the shop</Link>
          </p>
        </section>
      </div>
    </div>
  )
}

/** The demo key is only shown (and only offered to "Try it") in demo mode. */
async function TryItForDemo({ path }: { path: string }) {
  const demoKey = isDemoMode() ? (process.env.DEMO_API_KEY ?? null) : null
  return <TryIt path={path} demoKey={demoKey} />
}

async function DemoNote() {
  if (!isDemoMode()) return null
  const key = process.env.DEMO_API_KEY
  return (
    <Notice tone="info" title="Trying it out">
      <p>
        <strong>Try it</strong> buttons send real GET requests from this page, as whoever you’re signed in as (use “Explore the demo” on the{' '}
        <Link href="/login">sign-in page</Link> to become a demo customer, staff member or admin).
      </p>
      {key ? (
        <>
          <p className="mt-2">For curl, this read-only demo key works (scope catalog:read only, 30 requests a minute):</p>
          <p className="mt-1 rounded-control bg-raised p-2 font-mono text-xs break-all">{key}</p>
          <div className="mt-2">
            <CopyButton text={key} label="Copy demo key" small />
          </div>
          <pre className="relative mt-2 overflow-x-auto rounded-control bg-raised p-2 text-xs">{`curl -i "${appUrl('/api/v1/products?category=bags&limit=3')}" \\\n  -H "Authorization: Bearer ${key}"`}</pre>
        </>
      ) : null}
    </Notice>
  )
}
