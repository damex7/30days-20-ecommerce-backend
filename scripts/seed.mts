// npm run db:seed
//
// Fills the database with a believable shop: Ọjà, leather goods made in
// Aba and sold across Nigeria. It creates:
//   - 4 categories and 24 products with size/colour variants, realistic
//     Naira prices, a few on sale, and some stock running low or sold out;
//   - three coupons: ABA10 (active), SALLAH2026 (expired), FIRST50 (used up);
//   - accounts, all with confirmed emails:
//       admin@example.com     (Chiamaka, admin)   password from SEED_ADMIN_PASSWORD
//       staff@example.com     (Emeka, staff)      password from SEED_STAFF_PASSWORD
//       customer@example.com  (Adaeze, customer)  password from SEED_CUSTOMER_PASSWORD
//       tunde@, ngozi@, ibrahim@, funke@example.com (customers, same password)
//     each customer with a delivery address in a different state;
//   - about 40 orders spread over the past month, in EVERY status, each with
//     its history (order_events) and, when paid, a payment event;
//   - the demo staff and demo admin accounts (no password: they're only
//     reachable through the demo buttons when DEMO_MODE=true), and the
//     read-only demo API key from DEMO_API_KEY, if it's set.
//
// Delivery fees for all 37 states come from migration 008, not from here:
// the app needs them even in a database nobody seeds.
//
// The passwords come from environment variables (.env.local), never from
// this file: a password committed to git is public forever.
//
// SAFE TO RUN TWICE: everything is inserted with ON CONFLICT DO NOTHING or
// "only if not there yet", and orders are only generated into an EMPTY
// orders table. A second run changes nothing.
//
// Run `npm run db:migrate` first. Uses only "erasable" TypeScript, so Node
// runs it without a build step. It can't import from lib/ (those modules
// are server-only and use the @/ alias), so it talks to the database directly.

import { createHash } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.')
  process.exit(1)
}

// The same argon2id settings as lib/auth/password.ts.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 }

const PASSWORD_VARS = ['SEED_ADMIN_PASSWORD', 'SEED_STAFF_PASSWORD', 'SEED_CUSTOMER_PASSWORD'] as const
for (const name of PASSWORD_VARS) {
  const value = process.env[name]
  if (!value || value.length < 8 || value.length > 128) {
    console.error(`${name} must be set to a password of 8 to 128 characters (in .env.local).`)
    process.exit(1)
  }
}

// A small seeded random generator (mulberry32), so every run produces the
// same shop: stock levels and order history are the same on every machine.
function random(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = random(20)
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { slug: 'shoes', name: 'Shoes', description: 'Hand-lasted shoes from the workshops of Ariaria market.', position: 0, art: 'shoe' },
  { slug: 'bags', name: 'Bags', description: 'Totes, messengers and weekenders in full-grain leather.', position: 1, art: 'bag' },
  { slug: 'belts', name: 'Belts', description: 'Cut from one strip of hide, with solid brass buckles.', position: 2, art: 'belt' },
  { slug: 'sandals', name: 'Sandals', description: 'Slides and cross-straps for Lagos heat and Aba streets.', position: 3, art: 'sandal' },
] as const

type Cat = (typeof CATEGORIES)[number]['slug']
type SeedProduct = { slug: string; name: string; category: Cat; naira: number; colours: string[]; sizes: string[]; description: string; saleOff?: number; daysOld: number; code: string }

const SHOE_SIZES = ['40', '41', '42', '43', '44', '45']
const SANDAL_SIZES = ['39', '40', '41', '42', '43', '44']
const BELT_SIZES = ['32in', '34in', '36in', '38in']

const PRODUCTS: SeedProduct[] = [
  // Shoes
  { slug: 'ona-loafer', code: 'ONA', name: 'Ọ̀nà penny loafer', category: 'shoes', naira: 45_000, colours: ['Tan', 'Espresso'], sizes: SHOE_SIZES, daysOld: 3, description: 'A soft-soled penny loafer with a hand-stitched apron toe. Full-grain cowhide, lined in goatskin, made in Ariaria.' },
  { slug: 'ariaria-oxford', code: 'ARI', name: 'Ariaria Oxford', category: 'shoes', naira: 62_000, colours: ['Black', 'Oxblood'], sizes: SHOE_SIZES, daysOld: 40, description: 'A closed-lace Oxford for the office and owambe alike. Leather sole, stacked heel.' },
  { slug: 'enyimba-chelsea-boot', code: 'ENY', name: 'Enyimba Chelsea boot', category: 'shoes', naira: 75_000, colours: ['Espresso', 'Black'], sizes: SHOE_SIZES, saleOff: 10_000, daysOld: 25, description: 'Elastic-sided ankle boot with a pull tab and a rubber sole that grips in the rainy season.' },
  { slug: 'faulks-road-brogue', code: 'FAU', name: 'Faulks Road brogue', category: 'shoes', naira: 58_000, colours: ['Tan', 'Oxblood'], sizes: SHOE_SIZES, daysOld: 60, description: 'Wingtip brogue with hand-punched perforations along every seam.' },
  { slug: 'ngwa-monk-strap', code: 'NGW', name: 'Ngwa double monk strap', category: 'shoes', naira: 68_000, colours: ['Espresso', 'Black'], sizes: SHOE_SIZES, daysOld: 12, description: 'Two brass buckles and a plain toe. Breaks in within a week.' },
  { slug: 'aba-derby', code: 'DER', name: 'Aba derby', category: 'shoes', naira: 38_000, colours: ['Black', 'Tan'], sizes: SHOE_SIZES, saleOff: 6_000, daysOld: 90, description: 'An open-laced everyday derby. The workshop’s best seller since 2019.' },
  // Bags
  { slug: 'oja-market-tote', code: 'TOT', name: 'Ọjà market tote', category: 'bags', naira: 48_000, colours: ['Tan', 'Natural'], sizes: ['One size'], daysOld: 5, description: 'Big enough for a laptop and the day’s shopping. Riveted handles, inside zip pocket.' },
  { slug: 'igbo-ukwu-messenger', code: 'IGB', name: 'Igbo-Ukwu messenger', category: 'bags', naira: 72_000, colours: ['Espresso', 'Black'], sizes: ['One size'], daysOld: 33, description: 'A flap messenger with an adjustable strap, named for the bronze-casters of Igbo-Ukwu.' },
  { slug: 'umuahia-weekender', code: 'UMU', name: 'Umuahia weekender', category: 'bags', naira: 120_000, colours: ['Tan', 'Espresso'], sizes: ['One size'], saleOff: 15_000, daysOld: 48, description: 'Two nights in Enugu, a wedding outfit and shoes. Brass feet underneath.' },
  { slug: 'ikoyi-clutch', code: 'IKO', name: 'Ikoyi clutch', category: 'bags', naira: 35_000, colours: ['Black', 'Natural'], sizes: ['One size'], daysOld: 8, description: 'An envelope clutch with a magnetic flap and a wrist loop.' },
  { slug: 'ariaria-crossbody', code: 'XBD', name: 'Ariaria crossbody', category: 'bags', naira: 42_000, colours: ['Tan', 'Black'], sizes: ['One size'], daysOld: 70, description: 'Phone, wallet, keys and nothing else. Hands free in a busy market.' },
  { slug: 'enugu-backpack', code: 'BPK', name: 'Enugu backpack', category: 'bags', naira: 95_000, colours: ['Espresso', 'Natural'], sizes: ['One size'], daysOld: 20, description: 'A roll-top backpack with a padded laptop sleeve and buckled straps.' },
  // Belts
  { slug: 'classic-dress-belt', code: 'CDB', name: 'Classic dress belt', category: 'belts', naira: 15_000, colours: ['Black', 'Brown'], sizes: BELT_SIZES, daysOld: 80, description: '30 mm, feathered edges, a polished brass buckle.' },
  { slug: 'braided-belt', code: 'BRD', name: 'Braided belt', category: 'belts', naira: 18_000, colours: ['Tan', 'Brown'], sizes: BELT_SIZES, saleOff: 3_000, daysOld: 35, description: 'Hand-braided strips: the buckle goes through anywhere, no holes needed.' },
  { slug: 'brass-buckle-belt', code: 'BRS', name: 'Brass buckle belt', category: 'belts', naira: 22_000, colours: ['Black', 'Tan'], sizes: BELT_SIZES, daysOld: 15, description: '38 mm for jeans, with a heavy cast-brass buckle.' },
  { slug: 'reversible-belt', code: 'REV', name: 'Reversible belt', category: 'belts', naira: 25_000, colours: ['Black', 'Brown'], sizes: BELT_SIZES, daysOld: 55, description: 'Black on one side, brown on the other; the buckle swivels.' },
  { slug: 'workshop-belt', code: 'WRK', name: 'Workshop belt', category: 'belts', naira: 12_000, colours: ['Brown', 'Tan'], sizes: BELT_SIZES, daysOld: 100, description: 'The thick belt the cutters in Aba wear themselves. Built to outlast you.' },
  { slug: 'slim-belt', code: 'SLM', name: 'Slim belt', category: 'belts', naira: 9_500, colours: ['Black', 'Tan'], sizes: BELT_SIZES, daysOld: 7, description: '20 mm for dresses and high-waisted trousers.' },
  // Sandals
  { slug: 'palm-slide', code: 'PLM', name: 'Palm slide', category: 'sandals', naira: 14_000, colours: ['Tan', 'Black'], sizes: SANDAL_SIZES, daysOld: 2, description: 'One wide strap, a moulded footbed. Beach to buka.' },
  { slug: 'calabar-cross-strap', code: 'CAL', name: 'Calabar cross-strap', category: 'sandals', naira: 21_000, colours: ['Brown', 'Tan'], sizes: SANDAL_SIZES, daysOld: 18, description: 'Crossed straps over a leather footbed, stitched to a rubber sole.' },
  { slug: 'bonny-slingback', code: 'BON', name: 'Bonny slingback', category: 'sandals', naira: 26_000, colours: ['Black', 'Brown'], sizes: SANDAL_SIZES, saleOff: 4_000, daysOld: 44, description: 'A sandal with a heel strap, for days with a lot of walking.' },
  { slug: 'owerri-slide', code: 'OWE', name: 'Owerri slide', category: 'sandals', naira: 16_500, colours: ['Tan', 'Brown'], sizes: SANDAL_SIZES, daysOld: 28, description: 'Two buckled straps, adjustable for wide feet.' },
  { slug: 'nsukka-sandal', code: 'NSU', name: 'Nsukka sandal', category: 'sandals', naira: 19_000, colours: ['Black', 'Tan'], sizes: SANDAL_SIZES, daysOld: 65, description: 'A toe-loop sandal with a cushioned heel.' },
  { slug: 'ekpe-gladiator', code: 'EKP', name: 'Ekpe gladiator', category: 'sandals', naira: 33_000, colours: ['Brown', 'Black'], sizes: SANDAL_SIZES, daysOld: 10, description: 'Ankle-high straps with brass eyelets.' },
]

const ART_COLOURS: Record<string, string[]> = {
  shoe: ['tan', 'espresso', 'black', 'oxblood'],
  bag: ['tan', 'espresso', 'black', 'natural'],
  belt: ['black', 'tan', 'brown'],
  sandal: ['tan', 'black', 'brown'],
}

function artFor(category: Cat, colour: string): string {
  const art = CATEGORIES.find((c) => c.slug === category)!.art
  const wanted = colour.toLowerCase()
  const available = ART_COLOURS[art] ?? []
  return `/products/${art}-${available.includes(wanted) ? wanted : (available[0] ?? 'tan')}.svg`
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

type SeedUser = { email: string; name: string; role: 'customer' | 'staff' | 'admin'; phone: string | null; passwordVar: (typeof PASSWORD_VARS)[number] | null; isDemo?: boolean }

const USERS: SeedUser[] = [
  { email: 'admin@example.com', name: 'Chiamaka Eze', role: 'admin', phone: '+2348030000101', passwordVar: 'SEED_ADMIN_PASSWORD' },
  { email: 'staff@example.com', name: 'Emeka Nwosu', role: 'staff', phone: '+2348030000102', passwordVar: 'SEED_STAFF_PASSWORD' },
  { email: 'customer@example.com', name: 'Adaeze Okafor', role: 'customer', phone: '+2348031234567', passwordVar: 'SEED_CUSTOMER_PASSWORD' },
  { email: 'tunde@example.com', name: 'Tunde Bakare', role: 'customer', phone: '+2348052223344', passwordVar: 'SEED_CUSTOMER_PASSWORD' },
  { email: 'ngozi@example.com', name: 'Ngozi Umeh', role: 'customer', phone: '+2347066554433', passwordVar: 'SEED_CUSTOMER_PASSWORD' },
  { email: 'ibrahim@example.com', name: 'Ibrahim Sule', role: 'customer', phone: '+2349011223344', passwordVar: 'SEED_CUSTOMER_PASSWORD' },
  { email: 'funke@example.com', name: 'Funke Adeyemi', role: 'customer', phone: '+2348129876543', passwordVar: 'SEED_CUSTOMER_PASSWORD' },
  // Demo accounts: no password; entered only through the demo buttons.
  { email: 'demo-staff@demo.oja.invalid', name: 'Demo staff', role: 'staff', phone: null, passwordVar: null, isDemo: true },
  { email: 'demo-admin@demo.oja.invalid', name: 'Demo admin', role: 'admin', phone: null, passwordVar: null, isDemo: true },
]

const ADDRESSES: Record<string, { label: string; street: string; city: string; state: string; landmark: string | null }[]> = {
  'customer@example.com': [
    { label: 'Home', street: '14 Faulks Road', city: 'Aba', state: 'Abia', landmark: 'Opposite Ariaria market gate' },
    { label: 'Office', street: '3 Okpara Avenue', city: 'Enugu', state: 'Enugu', landmark: 'Beside the Mr Biggs' },
  ],
  'tunde@example.com': [{ label: 'Home', street: '22 Admiralty Way', city: 'Lekki Phase 1', state: 'Lagos', landmark: 'Near the toll gate' }],
  'ngozi@example.com': [{ label: 'Home', street: '7 Wetheral Road', city: 'Owerri', state: 'Imo', landmark: null }],
  'ibrahim@example.com': [{ label: 'Office', street: '5 Ahmadu Bello Way', city: 'Kaduna', state: 'Kaduna', landmark: 'Behind the Central Mosque' }],
  'funke@example.com': [{ label: 'Home', street: '40 Ring Road', city: 'Ibadan', state: 'Oyo', landmark: 'By Challenge bus stop' }],
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString })
const client = await pool.connect()

async function one<T>(c: PoolClient, text: string, values: unknown[] = []): Promise<T | undefined> {
  return (await c.query(text, values)).rows[0] as T | undefined
}

try {
  await client.query('BEGIN')

  // --- People -------------------------------------------------------------
  const userIds = new Map<string, string>()
  let newUsers = 0
  for (const user of USERS) {
    const password = user.passwordVar ? await hash(process.env[user.passwordVar] ?? '', ARGON2_OPTIONS) : null
    const inserted = await one<{ id: string }>(
      client,
      `INSERT INTO users (email, name, role, phone, password_hash, email_verified_at, is_demo)
       VALUES ($1, $2, $3, $4, $5, now() - interval '40 days', $6)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [user.email, user.name, user.role, user.phone, password, user.isDemo ?? false],
    )
    if (inserted) newUsers++
    const row = await one<{ id: string }>(client, 'SELECT id FROM users WHERE email = $1', [user.email])
    userIds.set(user.email, row!.id)
  }

  for (const [email, list] of Object.entries(ADDRESSES)) {
    const id = userIds.get(email)!
    const has = await one<{ n: number }>(client, 'SELECT count(*)::int AS n FROM addresses WHERE customer_id = $1', [id])
    if ((has?.n ?? 0) > 0) continue
    const user = USERS.find((u) => u.email === email)!
    for (const [index, address] of list.entries()) {
      await client.query(
        `INSERT INTO addresses (customer_id, label, recipient_name, phone, street, city, state, landmark, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, address.label, user.name, user.phone, address.street, address.city, address.state, address.landmark, index === 0],
      )
    }
  }

  // --- Catalogue ------------------------------------------------------------
  for (const c of CATEGORIES) {
    await client.query('INSERT INTO categories (slug, name, description, position) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING', [c.slug, c.name, c.description, c.position])
  }

  let newProducts = 0
  for (const p of PRODUCTS) {
    const inserted = await one<{ id: string }>(
      client,
      `INSERT INTO products (slug, name, description, category_id, status, created_at)
       VALUES ($1, $2, $3, (SELECT id FROM categories WHERE slug = $4), 'active', now() - make_interval(days => $5))
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [p.slug, p.name, p.description, p.category, p.daysOld],
    )
    if (!inserted) continue
    newProducts++
    const productId = inserted.id

    for (const colour of p.colours) {
      for (const size of p.sizes) {
        // Prices vary a little by size for shoes; everything else is flat.
        const naira = p.category === 'shoes' && Number(size) >= 44 ? p.naira + 2_000 : p.naira
        const price = (naira - (p.saleOff ?? 0)) * 100
        const compareAt = p.saleOff ? naira * 100 : null
        // Mostly healthy stock, some low ("Only 2 left"), a few sold out.
        const roll = rand()
        const stock = roll < 0.08 ? 0 : roll < 0.2 ? between(1, 2) : between(4, 18)
        const sku = `${p.code}-${size.replace(/in$/, '').toUpperCase()}-${colour.toUpperCase().slice(0, 3)}`.replace(/[^A-Z0-9-]/g, '')
        await client.query(
          `INSERT INTO product_variants (product_id, sku, size, colour, price_kobo, compare_at_price_kobo, stock)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (sku) DO NOTHING`,
          [productId, sku, size, colour, price, compareAt, stock],
        )
      }
    }
    for (const [position, colour] of p.colours.entries()) {
      await client.query('INSERT INTO product_images (product_id, url, alt, position) VALUES ($1, $2, $3, $4)', [productId, artFor(p.category, colour), `${p.name} in ${colour.toLowerCase()} leather`, position])
    }
  }

  // --- Coupons --------------------------------------------------------------
  await client.query(
    `INSERT INTO coupons (code, description, kind, value, min_order_kobo, max_uses, uses, per_customer_limit, starts_at, ends_at, active) VALUES
       ('ABA10', '10% off orders of ₦30,000 or more, once per customer', 'percent', 10, 3000000, 500, 0, 1, now() - interval '30 days', now() + interval '90 days', true),
       ('SALLAH2026', '₦5,000 off for Sallah (ended)', 'fixed', 500000, 2000000, NULL, 0, NULL, '2026-06-01T00:00:00+01:00', '2026-06-30T23:59:59+01:00', true),
       ('FIRST50', '₦2,500 off for the first 50 orders (all used)', 'fixed', 250000, 0, 50, 50, 1, now() - interval '60 days', NULL, true)
     ON CONFLICT (code) DO NOTHING`,
  )

  // --- The demo API key -------------------------------------------------------
  const demoKey = process.env.DEMO_API_KEY
  if (demoKey) {
    if (!/^oja_live_[A-Za-z0-9_-]{43}$/.test(demoKey)) {
      console.warn('! DEMO_API_KEY is set but not in the form oja_live_ + 43 base64url characters; skipped.')
    } else {
      await client.query(
        `INSERT INTO api_keys (name, prefix, key_hash, scopes, created_by, is_demo)
         VALUES ('Docs demo key (read-only)', $1, $2, ARRAY['catalog:read'], $3, true)
         ON CONFLICT (key_hash) DO NOTHING`,
        [demoKey.slice(0, 15), createHash('sha256').update(demoKey).digest('hex'), userIds.get('admin@example.com')],
      )
    }
  }

  // --- Orders: only into an empty table ---------------------------------------
  const existing = await one<{ n: number }>(client, 'SELECT count(*)::int AS n FROM orders')
  let newOrders = 0
  if ((existing?.n ?? 0) === 0) {
    const variants = (
      await client.query<{ id: string; sku: string; size: string; colour: string; price_kobo: string; name: string; slug: string; stock: number }>(
        `SELECT v.id, v.sku, v.size, v.colour, v.price_kobo, p.name, p.slug, v.stock
         FROM product_variants v JOIN products p ON p.id = v.product_id ORDER BY v.id`,
      )
    ).rows
    const customers = USERS.filter((u) => u.role === 'customer' && !u.isDemo)

    // A mix weighted towards finished orders, with every status present.
    // The newest few are still moving; the oldest are long delivered.
    const PLAN: { daysAgo: number; status: string }[] = []
    for (let i = 0; i < 40; i++) {
      const daysAgo = 30 - Math.floor((i * 30) / 40)
      let status: string
      if (daysAgo > 12) status = pick(['delivered', 'delivered', 'delivered', 'delivered', 'refunded', 'cancelled'])
      else if (daysAgo > 6) status = pick(['delivered', 'shipped', 'shipped', 'cancelled'])
      else if (daysAgo > 2) status = pick(['shipped', 'processing', 'processing', 'paid'])
      else status = pick(['paid', 'processing', 'paid'])
      PLAN.push({ daysAgo, status })
    }
    // Make sure every status appears, including two orders still awaiting payment.
    const force = ['delivered', 'shipped', 'processing', 'paid', 'cancelled', 'refunded']
    force.forEach((status, i) => {
      if (!PLAN.some((p) => p.status === status)) PLAN[10 + i]!.status = status
    })
    PLAN.push({ daysAgo: 0, status: 'pending_payment' }, { daysAgo: 0, status: 'pending_payment' })

    const steps: Record<string, string[]> = {
      pending_payment: [],
      cancelled: ['cancelled'],
      paid: ['paid'],
      processing: ['paid', 'processing'],
      shipped: ['paid', 'processing', 'shipped'],
      delivered: ['paid', 'processing', 'shipped', 'delivered'],
      refunded: ['paid', 'refunded'],
    }
    const staffId = userIds.get('staff@example.com')!
    // ABA10 is once per customer (its own rule), so the seed respects that too.
    const usedAba10 = new Set<string>()

    for (const [index, plan] of PLAN.entries()) {
      const customer = customers[index % customers.length]!
      const customerId = userIds.get(customer.email)!
      const address = (ADDRESSES[customer.email] ?? [])[0]!
      const fee = (await one<{ fee_kobo: string; min_days: number; max_days: number }>(client, 'SELECT fee_kobo, min_days, max_days FROM delivery_fees WHERE state = $1', [address.state]))!
      // An order still awaiting payment reserves stock, so it can only hold what is on the shelf.
      const choices = plan.status === 'pending_payment' ? variants.filter((v) => v.stock >= 2) : variants
      const lines = Array.from({ length: between(1, 3) }, () => pick(choices)).filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i)
      const quantities = lines.map(() => (rand() < 0.8 ? 1 : 2))
      const subtotal = lines.reduce((sum, v, i) => sum + Number(v.price_kobo) * quantities[i]!, 0)
      // Some orders used ABA10 (only paid-ish ones over the minimum, once per customer).
      // customer@example.com never has, so whoever tries the demo login can apply ABA10 themselves.
      const usesCoupon = subtotal >= 3_000_000 && plan.status !== 'cancelled' && plan.status !== 'pending_payment' && !usedAba10.has(customer.email) && customer.email !== 'customer@example.com' && rand() < 0.4
      if (usesCoupon) usedAba10.add(customer.email)
      const discount = usesCoupon ? Math.floor(subtotal / 10) : 0
      const total = subtotal - discount + Number(fee.fee_kobo)

      // Placed at a believable time of day (Lagos), then each later step a few hours on.
      const placed = new Date(Date.now() - plan.daysAgo * 86_400_000 - between(1, 10) * 3_600_000)
      if (plan.status === 'pending_payment') placed.setTime(Date.now() - between(2, 8) * 60_000)
      const pending = plan.status === 'pending_payment'
      // Paid 4 minutes after placing; each later step 18 hours after the one before.
      const stepTimes = steps[plan.status]!.map((_, i) => new Date(placed.getTime() + (i === 0 ? 4 : i * 18 * 60) * 60_000))
      const paidAt = steps[plan.status]!.includes('paid') ? stepTimes[0]! : null
      const finalAt = stepTimes[stepTimes.length - 1] ?? placed

      const order = (await one<{ id: string; number: string }>(
        client,
        `INSERT INTO orders (customer_id, customer_email, customer_name, status, subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo,
                             coupon_code, ship_recipient, ship_phone, ship_street, ship_city, ship_state, ship_landmark,
                             delivery_min_days, delivery_max_days, paystack_reference, paid_at, expires_at, cancelled_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
         RETURNING id, number`,
        [
          customerId, customer.email, customer.name, plan.status, subtotal, discount, fee.fee_kobo, total,
          usesCoupon ? 'ABA10' : null, customer.name, customer.phone, address.street, address.city, address.state, address.landmark,
          fee.min_days, fee.max_days, `oja_seed_${String(index + 1).padStart(4, '0')}`, paidAt,
          pending ? new Date(placed.getTime() + 30 * 60_000) : null,
          plan.status === 'cancelled' || plan.status === 'refunded' ? finalAt : null,
          placed, finalAt,
        ],
      ))!

      for (const [i, v] of lines.entries()) {
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, product_name, product_slug, variant_label, sku, unit_price_kobo, quantity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [order.id, v.id, v.name, v.slug, `Size ${v.size} · ${v.colour}`, v.sku, v.price_kobo, quantities[i]],
        )
        // A pending order RESERVES stock, exactly as checkout would.
        if (pending) await client.query('UPDATE product_variants SET stock = GREATEST(stock - $1, 0) WHERE id = $2', [quantities[i], v.id])
      }
      if (usesCoupon) {
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id, discount_kobo, created_at)
           VALUES ((SELECT id FROM coupons WHERE code = 'ABA10'), $1, $2, $3, $4)`,
          [customerId, order.id, discount, placed],
        )
        await client.query(`UPDATE coupons SET uses = uses + 1 WHERE code = 'ABA10'`)
      }

      // The history: created, then each step, by the right actor.
      const event = (type: string, from: string | null, to: string | null, at: Date, actor: { id: string | null; label: string }, note: string | null = null, metadata: object = {}) =>
        client.query(
          `INSERT INTO order_events (order_id, type, from_status, to_status, note, actor_user_id, actor_label, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [order.id, type, from, to, note, actor.id, actor.label, JSON.stringify(metadata), at],
        )
      await event('created', null, 'pending_payment', placed, { id: customerId, label: `${customer.name} (customer)` }, null, { total_kobo: total })
      let previous = 'pending_payment'
      for (const [i, step] of steps[plan.status]!.entries()) {
        const at = stepTimes[i]!
        if (step === 'paid') {
          await event('status_changed', previous, 'paid', at, { id: null, label: 'Paystack' }, 'Payment received (webhook).', { reference: `oja_seed_${String(index + 1).padStart(4, '0')}` })
          await event('payment_received', null, null, at, { id: null, label: 'Paystack' }, null, { amount_kobo: total })
          await client.query(
            `INSERT INTO payment_events (event_id, source, event_type, reference, order_id, amount_kobo, currency, payload, outcome, received_at, processed_at)
             VALUES ($1, 'webhook', 'charge.success', $2, $3, $4, 'NGN', $5, 'paid', $6, $6)`,
            [`charge.success:seed-${index + 1}`, `oja_seed_${String(index + 1).padStart(4, '0')}`, order.id, total, JSON.stringify({ event: 'charge.success', data: { reference: `oja_seed_${String(index + 1).padStart(4, '0')}`, amount: total, currency: 'NGN', status: 'success' } }), at],
          )
        } else if (step === 'cancelled') {
          await event('status_changed', previous, 'cancelled', at, { id: null, label: 'Expiry sweep' }, 'Not paid within 30 minutes. The reserved stock and any coupon use were released.')
        } else if (step === 'refunded') {
          await event('status_changed', previous, 'refunded', at, { id: staffId, label: 'Emeka Nwosu (staff)' }, 'Customer asked to cancel before dispatch.')
        } else {
          await event('status_changed', previous, step, at, { id: staffId, label: 'Emeka Nwosu (staff)' }, step === 'shipped' ? 'Sent with GIG Logistics.' : null)
        }
        previous = step
      }
      newOrders++
    }
  }

  await client.query('COMMIT')
  console.log(`✓ Seeded: ${newUsers} new accounts, ${newProducts} new products, ${newOrders} new orders.`)
  if (newUsers === 0 && newProducts === 0 && newOrders === 0) console.log('  (Everything was already there; nothing changed.)')
  console.log('  Sign in as admin@example.com, staff@example.com or customer@example.com with the passwords from .env.local.')
} catch (error) {
  await client.query('ROLLBACK')
  console.error('✗ Seeding failed and was rolled back.')
  throw error
} finally {
  client.release()
  await pool.end()
}
