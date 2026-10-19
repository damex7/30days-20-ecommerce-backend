// npm run db:explain
//
// Shows how PostgreSQL runs the hot queries (EXPLAIN ANALYZE), first on the
// seeded shop, then again with 20,000 extra products and 40,000 extra
// orders added INSIDE A TRANSACTION THAT IS ROLLED BACK, so the database is
// left exactly as it was. A plan that looks fine on 24 rows can be a
// sequential scan of 20,000; the second run shows the indexes earning
// their keep.
//
// The SQL below is the same text the repos send (lib/repos/products.ts
// listProducts and lib/repos/orders.ts listOrders), with the parameters
// filled in as PostgreSQL would receive them.

import { neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const summarySelect = `
  SELECT p.id, p.slug, p.name, p.status, p.description,
         p.category_id, c.slug, c.name, p.price_from_kobo, s.compare_at_from, p.in_stock, s.stock_total,
         img.url, img.alt, p.version, p.created_at, p.updated_at, p.created_at::text
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(v.stock) FILTER (WHERE v.status = 'active'), 0) AS stock_total,
           min(v.compare_at_price_kobo) FILTER (WHERE v.status = 'active' AND v.price_kobo = p.price_from_kobo) AS compare_at_from
    FROM product_variants v WHERE v.product_id = p.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT i.url, i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1
  ) img ON true`

const orderColumns = `o.id, o.number, o.customer_id, o.status, o.total_kobo, o.created_at,
  (SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count`

const QUERIES: { title: string; sql: string; params: unknown[] }[] = [
  {
    title: 'Product list: category "shoes", newest first, first page (GET /api/v1/products?category=shoes)',
    sql: `${summarySelect} WHERE p.status = 'active' AND p.category_id = (SELECT id FROM categories WHERE slug = $1)
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2`,
    params: ['shoes', 25],
  },
  {
    title: 'Product list: size 42 in tan, in stock, under ₦50,000, cheapest first (variant filters in one EXISTS)',
    sql: `${summarySelect} WHERE p.status = 'active'
            AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.status = 'active'
                        AND lower(v.size) = lower($1) AND lower(v.colour) = lower($2) AND v.price_kobo <= $3 AND v.stock > 0)
            AND p.price_from_kobo IS NOT NULL
          ORDER BY p.price_from_kobo, p.id LIMIT $4`,
    params: ['42', 'Tan', 5_000_000, 25],
  },
  {
    title: 'Product list: full-text search "leather loafer"',
    sql: `${summarySelect} WHERE p.status = 'active' AND p.search @@ websearch_to_tsquery('english', $1)
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2`,
    params: ['leather loafer', 25],
  },
  {
    title: 'Admin orders: status "paid", newest first (GET /api/v1/orders?status=paid)',
    sql: `SELECT ${orderColumns} FROM orders o WHERE o.status = $1 ORDER BY o.created_at DESC, o.id DESC LIMIT $2`,
    params: ['paid', 21],
  },
  {
    title: 'A customer’s orders, newest first (GET /api/v1/orders as a customer)',
    sql: `SELECT ${orderColumns} FROM orders o WHERE o.customer_id = (SELECT id FROM users WHERE email = $1) ORDER BY o.created_at DESC, o.id DESC LIMIT $2`,
    params: ['customer@example.com', 11],
  },
  {
    title: 'The expiry sweep: unpaid orders whose 30 minutes are up',
    sql: `SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at <= now() ORDER BY expires_at LIMIT $1`,
    params: [50],
  },
]

const pool = new Pool({ connectionString })
const client = await pool.connect()

async function explainAll(label: string) {
  console.log(`\n${'='.repeat(78)}\n${label}\n${'='.repeat(78)}`)
  for (const q of QUERIES) {
    const { rows } = await client.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF, SUMMARY ON) ${q.sql}`, q.params)
    console.log(`\n-- ${q.title}`)
    for (const row of rows) console.log(row['QUERY PLAN'])
  }
}

try {
  await explainAll('ON THE SEEDED SHOP')

  await client.query('BEGIN')
  // 20,000 extra active products in the four categories, each with three
  // variants, and 40,000 orders over the last year in every status.
  await client.query(`
    INSERT INTO products (slug, name, description, category_id, status, created_at)
    SELECT 'bulk-' || g, 'Bulk product ' || g, 'A generated product for EXPLAIN', (SELECT id FROM categories ORDER BY id OFFSET (g % 4) LIMIT 1),
           CASE WHEN g % 10 = 0 THEN 'archived' WHEN g % 10 = 1 THEN 'draft' ELSE 'active' END,
           now() - make_interval(mins => g)
    FROM generate_series(1, 20000) g`)
  await client.query(`
    INSERT INTO product_variants (product_id, sku, size, colour, price_kobo, stock)
    SELECT p.id, 'BULK-' || p.id || '-' || s, (39 + s)::text, (ARRAY['Tan', 'Black', 'Brown'])[s], 1000000 + (p.id % 90) * 100000, (p.id + s) % 7
    FROM products p CROSS JOIN generate_series(1, 3) s WHERE p.slug LIKE 'bulk-%'`)
  await client.query(`
    INSERT INTO orders (customer_id, customer_email, customer_name, status, subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo,
                        ship_recipient, ship_phone, ship_street, ship_city, ship_state, delivery_min_days, delivery_max_days,
                        paystack_reference, paid_at, expires_at, created_at)
    SELECT (SELECT id FROM users WHERE role = 'customer' ORDER BY email OFFSET (g % 5) LIMIT 1), 'bulk@example.com', 'Bulk', st,
           5000000, 0, 400000, 5400000, 'Bulk', '+2348000000000', 'Street', 'City', 'Lagos', 2, 4, 'oja_bulk_' || g,
           CASE WHEN st IN ('pending_payment', 'cancelled') THEN NULL ELSE now() END,
           CASE WHEN st = 'pending_payment' THEN now() + interval '20 minutes' END,
           now() - make_interval(mins => g * 13)
    FROM generate_series(1, 40000) g,
         LATERAL (SELECT (ARRAY['delivered','delivered','delivered','shipped','processing','paid','cancelled','refunded'])[1 + g % 8] AS st) x`)
  await client.query('ANALYZE products, product_variants, orders')
  await explainAll('WITH 20,000 MORE PRODUCTS AND 40,000 MORE ORDERS (rolled back afterwards)')
} finally {
  await client.query('ROLLBACK').catch(() => {})
  client.release()
  await pool.end()
}
