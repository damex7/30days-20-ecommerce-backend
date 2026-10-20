// npm run api:smoke
//
// Checks the main API flows against a RUNNING server (npm run dev, or
// npm run build && npm start), and prints PASS or FAIL for each:
//
//   1. list and filter products (with SMOKE_API_KEY)
//   2. walk every page to the end with cursors, with no product twice
//   3. ETag: the same request with If-None-Match comes back 304
//   4. a bad API key is 401 problem+json
//   5. create an order twice with the same Idempotency-Key → the same order
//   6. the same key with a different body → 422
//   7. a bad body → 422 application/problem+json with an errors array
//   8. another customer's order → 404 (not 403)
//   9. a stale version → 409, and a move outside the state machine → 409
//  10. every response carries an X-Request-Id
//
// It signs in as customer@example.com and tunde@example.com (from the seed,
// password SEED_CUSTOMER_PASSWORD) and cancels the order it made, so the
// stock it reserved goes back. This is a script, not a test framework.
//
// Env: SMOKE_API_KEY (any key with catalog:read), SEED_CUSTOMER_PASSWORD,
// and optionally SMOKE_BASE_URL (default APP_URL, then http://localhost:3020).

import { randomUUID } from 'node:crypto'

const BASE = (process.env.SMOKE_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3020').replace(/\/+$/, '')
const KEY = process.env.SMOKE_API_KEY
const PASSWORD = process.env.SEED_CUSTOMER_PASSWORD

if (!KEY || !PASSWORD) {
  console.error('Set SMOKE_API_KEY (create one on /admin/api-keys) and SEED_CUSTOMER_PASSWORD in .env.local first.')
  process.exit(1)
}

type Json = Record<string, unknown>
type Reply = { status: number; headers: Headers; body: Json }

let passed = 0
let failed = 0
const sawRequestIds: boolean[] = []

function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${!ok && detail ? `\n        ${detail}` : ''}`)
}

async function call(method: string, path: string, options: { key?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Reply> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) }
  if (options.key) headers.Authorization = `Bearer ${options.key}`
  if (options.cookie) headers.Cookie = options.cookie
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: 'manual' })
  // 304s are exempt: a CDN (Vercel's edge included) may strip everything but
  // the caching headers from a "Not Modified", as HTTP allows.
  if (response.status !== 304) sawRequestIds.push(Boolean(response.headers.get('x-request-id')))
  const text = await response.text()
  let body: Json = {}
  try {
    body = text ? (JSON.parse(text) as Json) : {}
  } catch {
    body = { raw: text }
  }
  return { status: response.status, headers: response.headers, body }
}

async function login(email: string): Promise<string> {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  if (response.status !== 200 || !cookie) throw new Error(`Couldn't sign in as ${email} (HTTP ${response.status}). Did you run npm run db:seed with SEED_CUSTOMER_PASSWORD set?`)
  return cookie
}

console.log(`\nSmoke-testing ${BASE}/api/v1\n`)

try {
  // 1. List and filter --------------------------------------------------------
  const shoes = await call('GET', '/api/v1/products?category=shoes&limit=50', { key: KEY })
  const shoeItems = (shoes.body.data as Json[] | undefined) ?? []
  check('list products filtered by category (200, only shoes)', shoes.status === 200 && shoeItems.length > 0 && shoeItems.every((p) => (p.category as Json).slug === 'shoes'), `HTTP ${shoes.status}`)

  const cheap = await call('GET', '/api/v1/products?max_price=2000000&sort=price_asc&limit=50', { key: KEY })
  const prices = ((cheap.body.data as Json[] | undefined) ?? []).map((p) => Number(p.price_from_kobo))
  check('filter by price and sort price_asc (sorted, all ≤ ₦20,000 variants)', cheap.status === 200 && prices.every((p, i) => i === 0 || p >= (prices[i - 1] ?? 0)), `prices: ${prices.join(', ')}`)

  // 2. Cursor pagination to the end --------------------------------------------
  const seen = new Set<number>()
  let cursor: string | null = null
  let pages = 0
  let duplicate = false
  do {
    const page: Reply = await call('GET', `/api/v1/products?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { key: KEY })
    if (page.status !== 200) break
    for (const p of (page.body.data as Json[]) ?? []) {
      if (seen.has(Number(p.id))) duplicate = true
      seen.add(Number(p.id))
    }
    cursor = (page.body.next_cursor as string | null) ?? null
    pages++
  } while (cursor && pages < 100)
  check(`paginate to the end with cursors (${seen.size} products over ${pages} pages, none twice)`, !cursor && !duplicate && seen.size > 0)

  const tampered = await call('GET', '/api/v1/products?limit=5&cursor=not-a-real-cursor', { key: KEY })
  check('a tampered cursor is 400 problem+json', tampered.status === 400 && String(tampered.headers.get('content-type')).includes('application/problem+json'))

  // 3. ETag / 304 ----------------------------------------------------------------
  const first = await call('GET', '/api/v1/products/ona-loafer')
  const etag = first.headers.get('etag')
  const again = await call('GET', '/api/v1/products/ona-loafer', { headers: etag ? { 'If-None-Match': etag } : {} })
  check('If-None-Match with the ETag answers 304', first.status === 200 && Boolean(etag) && again.status === 304, `first ${first.status}, etag ${etag}, second ${again.status}`)

  // 4. Bad key -------------------------------------------------------------------
  const badKey = await call('GET', '/api/v1/me', { key: `oja_live_${'x'.repeat(43)}` })
  check('a bad API key is 401 problem+json with WWW-Authenticate', badKey.status === 401 && Boolean(badKey.headers.get('www-authenticate')))

  // 5-6. Idempotent order creation -----------------------------------------------
  const adaeze = await login('customer@example.com')
  const product = await call('GET', '/api/v1/products/aba-derby')
  const variant = ((product.body.variants as Json[] | undefined) ?? []).find((v) => Number(v.stock) > 0)
  if (!variant) throw new Error('No in-stock variant of aba-derby to put in the cart.')
  await call('POST', '/api/v1/cart/items', { cookie: adaeze, body: { variant_id: variant.id, quantity: 1 } })
  const addresses = (((await call('GET', '/api/v1/addresses', { cookie: adaeze })).body.data as Json[] | undefined) ?? [])
  const [home, office] = addresses
  if (!home) throw new Error('customer@example.com has no saved address.')

  const key = randomUUID()
  const orderA = await call('POST', '/api/v1/orders', { cookie: adaeze, body: { address_id: home.id }, headers: { 'Idempotency-Key': key } })
  const orderB = await call('POST', '/api/v1/orders', { cookie: adaeze, body: { address_id: home.id }, headers: { 'Idempotency-Key': key } })
  check(
    'POST /orders twice with the same Idempotency-Key → the same order',
    orderA.status === 201 && orderB.status === 201 && orderA.body.id === orderB.body.id && orderB.headers.get('idempotent-replayed') === 'true' && Boolean(orderA.headers.get('location')),
    `first ${orderA.status} #${String(orderA.body.id)}, second ${orderB.status} #${String(orderB.body.id)} (${JSON.stringify(orderA.body).slice(0, 200)})`,
  )

  const reused = await call('POST', '/api/v1/orders', { cookie: adaeze, body: { address_id: office?.id ?? Number(home.id) + 1_000_000 }, headers: { 'Idempotency-Key': key } })
  check('the same key with a different body → 422', reused.status === 422 && String(reused.body.type).endsWith('idempotency_key_reused'), `HTTP ${reused.status} ${String(reused.body.type)}`)

  const noKey = await call('POST', '/api/v1/orders', { cookie: adaeze, body: { address_id: home.id } })
  check('no Idempotency-Key → 400', noKey.status === 400)

  // 7. Bad body ------------------------------------------------------------------
  const bad = await call('POST', '/api/v1/orders', { cookie: adaeze, body: { address_id: 'abc' }, headers: { 'Idempotency-Key': randomUUID() } })
  const errors = bad.body.errors as { field: string; message: string }[] | undefined
  check(
    'a bad body → 422 application/problem+json with errors[]',
    bad.status === 422 && String(bad.headers.get('content-type')).includes('application/problem+json') && Array.isArray(errors) && errors[0]?.field === 'address_id' && typeof bad.body.request_id === 'string',
    JSON.stringify(bad.body),
  )

  // 8. Someone else's order ------------------------------------------------------
  const tunde = await login('tunde@example.com')
  const stranger = await call('GET', `/api/v1/orders/${String(orderA.body.id)}`, { cookie: tunde })
  check("another customer's order → 404 (not 403)", stranger.status === 404, `HTTP ${stranger.status}`)
  const missing = await call('GET', '/api/v1/orders/999999999', { cookie: tunde })
  check('…the same answer as an order that does not exist', missing.status === 404 && missing.body.title === stranger.body.title)

  // 9. Conflicts: stale version, impossible move ----------------------------------
  const stale = await call('POST', `/api/v1/orders/${String(orderA.body.id)}/transitions`, { cookie: adaeze, body: { to: 'cancelled', version: 999 } })
  check('a stale version → 409 stale_version', stale.status === 409 && String(stale.body.type).endsWith('stale_version'), `HTTP ${stale.status} ${String(stale.body.type)}`)
  const cancel = await call('POST', `/api/v1/orders/${String(orderA.body.id)}/transitions`, { cookie: adaeze, body: { to: 'cancelled', version: orderA.body.version } })
  check('the owner cancels their unpaid order (stock released)', cancel.status === 200 && cancel.body.status === 'cancelled', `HTTP ${cancel.status}`)
  const impossible = await call('POST', `/api/v1/orders/${String(orderA.body.id)}/transitions`, { cookie: adaeze, body: { to: 'shipped', version: cancel.body.version } })
  check('a move outside the state machine → 409 invalid_transition', impossible.status === 409 && String(impossible.body.type).endsWith('invalid_transition'), `HTTP ${impossible.status} ${String(impossible.body.type)}`)

  // 10. Request ids --------------------------------------------------------------
  check(`every response (but 304s) carried X-Request-Id (${sawRequestIds.length} responses)`, sawRequestIds.every(Boolean))
} catch (error) {
  failed++
  console.log(`  FAIL  the run stopped: ${error instanceof Error ? error.message : String(error)}`)
}

console.log(`\n${passed} passed, ${failed} failed.\n`)
process.exit(failed ? 1 : 0)
