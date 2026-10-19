// PRODUCTS, VARIANTS AND IMAGES: SQL only.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { empty, join, q, type Sql } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export const ProductSummaryRow = z.object({
  id: int8,
  slug: z.string(),
  name: z.string(),
  status: z.enum(PRODUCT_STATUSES),
  categoryId: z.number().int(),
  categorySlug: z.string(),
  categoryName: z.string(),
  priceFromKobo: int8.nullable(),
  compareAtFromKobo: int8.nullable(),
  inStock: z.boolean(),
  stockTotal: int8,
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // created_at as PostgreSQL text: microsecond precision for the cursor
  // (a JavaScript Date only keeps milliseconds, and two products created
  // in the same millisecond would otherwise confuse the next page).
  cursorTs: z.string(),
})
export type ProductSummaryRow = z.infer<typeof ProductSummaryRow>

export const VariantRow = z.object({
  id: int8,
  productId: int8,
  sku: z.string(),
  size: z.string(),
  colour: z.string(),
  priceKobo: int8,
  compareAtPriceKobo: int8.nullable(),
  stock: z.number().int(),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type VariantRow = z.infer<typeof VariantRow>

export const ImageRow = z.object({
  id: int8,
  productId: int8,
  url: z.string(),
  alt: z.string(),
  position: z.number().int(),
})
export type ImageRow = z.infer<typeof ImageRow>

export const ProductDetailRow = ProductSummaryRow.extend({ description: z.string() })
export type ProductDetailRow = z.infer<typeof ProductDetailRow>

// The columns every product query returns. The two LATERAL joins work out,
// per product on the page only, the total stock and the "was" price of the
// cheapest variant, and the main image.
const summarySelect = q`
  SELECT p.id, p.slug, p.name, p.status, p.description,
         p.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName",
         p.price_from_kobo AS "priceFromKobo", s.compare_at_from AS "compareAtFromKobo",
         p.in_stock AS "inStock", s.stock_total AS "stockTotal",
         img.url AS "imageUrl", img.alt AS "imageAlt",
         p.version, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         p.created_at::text AS "cursorTs"
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

// ---------------------------------------------------------------------------
// The product list
// ---------------------------------------------------------------------------

export type ProductListQuery = {
  /** Public lists pass ['active'] (and get the partial indexes); staff may ask for others. */
  statuses: readonly ProductStatus[]
  categorySlug?: string
  search?: string
  minPriceKobo?: number
  maxPriceKobo?: number
  size?: string
  colour?: string
  inStock?: boolean
  sort: ProductSort
  /** The last row of the previous page: [created_at text, id] or [price, id]. */
  after?: { ts: string; id: number } | { price: number; id: number }
  limit: number
}

/**
 * THE PRODUCT LIST QUERY (its EXPLAIN is in the README).
 *
 * - Status: the public list compares with the LITERAL 'active', so the
 *   planner can use the partial indexes from 007 (which only hold active
 *   products). With `status = ANY($1)` it couldn't prove the parameter
 *   matches the index's WHERE clause.
 * - Variant filters (size, colour, price range, in stock) go in ONE
 *   EXISTS: "is there a variant that is 42 AND tan AND under ₦50,000 AND in
 *   stock?", not four separate questions that different variants could
 *   each answer.
 * - "In stock" alone uses the denormalised products.in_stock.
 * - The cursor condition is a ROW comparison, (a, b) < (x, y), which
 *   PostgreSQL turns into an index range seek.
 * - It asks for limit + 1 rows to know whether there's a next page.
 */
export function listProducts(db: Db, query: ProductListQuery): Promise<ProductSummaryRow[]> {
  const onlyActive = query.statuses.length === 1 && query.statuses[0] === 'active'
  const where: Sql[] = [onlyActive ? q`p.status = 'active'` : q`p.status = ANY(${[...query.statuses]}::text[])`]

  if (query.categorySlug) where.push(q`p.category_id = (SELECT id FROM categories WHERE slug = ${query.categorySlug})`)
  if (query.search) where.push(q`p.search @@ websearch_to_tsquery('english', ${query.search})`)

  const variantConditions: Sql[] = []
  if (query.size) variantConditions.push(q`lower(v.size) = lower(${query.size})`)
  if (query.colour) variantConditions.push(q`lower(v.colour) = lower(${query.colour})`)
  if (query.minPriceKobo !== undefined) variantConditions.push(q`v.price_kobo >= ${query.minPriceKobo}`)
  if (query.maxPriceKobo !== undefined) variantConditions.push(q`v.price_kobo <= ${query.maxPriceKobo}`)
  if (variantConditions.length > 0) {
    if (query.inStock) variantConditions.push(q`v.stock > 0`)
    where.push(q`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND ${join(variantConditions, ' AND ')})`)
  } else if (query.inStock) {
    where.push(q`p.in_stock`)
  }

  let order: Sql
  const after = query.after
  if (query.sort === 'newest') {
    order = q`ORDER BY p.created_at DESC, p.id DESC`
    if (after && 'ts' in after) where.push(q`(p.created_at, p.id) < (${after.ts}::timestamptz, ${after.id})`)
  } else {
    // A product without an active variant has no price to sort by.
    where.push(q`p.price_from_kobo IS NOT NULL`)
    if (query.sort === 'price_asc') {
      order = q`ORDER BY p.price_from_kobo, p.id`
      if (after && 'price' in after) where.push(q`(p.price_from_kobo, p.id) > (${after.price}, ${after.id})`)
    } else {
      // The same (price, id) index, read backwards.
      order = q`ORDER BY p.price_from_kobo DESC, p.id DESC`
      if (after && 'price' in after) where.push(q`(p.price_from_kobo, p.id) < (${after.price}, ${after.id})`)
    }
  }

  return rows(db, ProductSummaryRow, q`${summarySelect} WHERE ${join(where, ' AND ')} ${order} LIMIT ${query.limit + 1}`, 'listProducts')
}

/** Distinct sizes and colours of active variants of active products, for the filter controls. */
export async function listFacets(db: Db): Promise<{ sizes: string[]; colours: string[] }> {
  const result = await rows(
    db,
    z.object({ kind: z.enum(['size', 'colour']), value: z.string() }),
    q`SELECT DISTINCT 'size' AS kind, v.size AS value FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.status = 'active' AND p.status = 'active'
      UNION
      SELECT DISTINCT 'colour', v.colour FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.status = 'active' AND p.status = 'active'`,
    'listFacets',
  )
  const sizes = result.filter((r) => r.kind === 'size').map((r) => r.value)
  const colours = result.filter((r) => r.kind === 'colour').map((r) => r.value)
  // Shoe sizes sort as numbers (39 before 40 before 100), words alphabetically.
  const bySize = (a: string, b: string) => (Number(a) || Infinity) - (Number(b) || Infinity) || a.localeCompare(b)
  return { sizes: sizes.sort(bySize), colours: colours.sort((a, b) => a.localeCompare(b)) }
}

// ---------------------------------------------------------------------------
// One product
// ---------------------------------------------------------------------------

export function findProductBySlug(db: Db, slug: string, statuses: readonly ProductStatus[]): Promise<ProductDetailRow | null> {
  return one(db, ProductDetailRow, q`${summarySelect} WHERE p.slug = ${slug} AND p.status = ANY(${[...statuses]}::text[])`, 'findProductBySlug')
}

export function findProductById(db: Db, id: number): Promise<ProductDetailRow | null> {
  return one(db, ProductDetailRow, q`${summarySelect} WHERE p.id = ${id}`, 'findProductById')
}

const variantColumns = q`
  v.id, v.product_id AS "productId", v.sku, v.size, v.colour, v.price_kobo AS "priceKobo",
  v.compare_at_price_kobo AS "compareAtPriceKobo", v.stock, v.status, v.version,
  v.created_at AS "createdAt", v.updated_at AS "updatedAt"`

/** The variants of some products, in a stable order (size as a number when it is one, then colour). */
export function listVariants(db: Db, productIds: number[], includeArchived: boolean): Promise<VariantRow[]> {
  return rows(
    db,
    VariantRow,
    q`SELECT ${variantColumns} FROM product_variants v
      WHERE v.product_id = ANY(${productIds}::bigint[]) ${includeArchived ? empty : q`AND v.status = 'active'`}
      ORDER BY v.product_id, (CASE WHEN v.size ~ '^[0-9]+$' THEN v.size::int END) NULLS LAST, v.size, v.colour`,
    'listVariants',
  )
}

export function listImages(db: Db, productIds: number[]): Promise<ImageRow[]> {
  return rows(
    db,
    ImageRow,
    q`SELECT i.id, i.product_id AS "productId", i.url, i.alt, i.position
      FROM product_images i WHERE i.product_id = ANY(${productIds}::bigint[])
      ORDER BY i.product_id, i.position`,
    'listImages',
  )
}

export function findVariant(db: Db, id: number): Promise<VariantRow | null> {
  return one(db, VariantRow, q`SELECT ${variantColumns} FROM product_variants v WHERE v.id = ${id}`, 'findVariant')
}

/** Has this product (or variant) ever been ordered? Decides "delete" versus "archive". */
export async function hasBeenOrdered(db: Db, target: { productId: number } | { variantId: number }): Promise<boolean> {
  const where = 'productId' in target
    ? q`oi.variant_id IN (SELECT id FROM product_variants WHERE product_id = ${target.productId})`
    : q`oi.variant_id = ${target.variantId}`
  const result = await db.query(q`SELECT EXISTS (SELECT 1 FROM order_items oi WHERE ${where}) AS ordered`)
  return result[0]?.ordered === true
}

// ---------------------------------------------------------------------------
// Writes (staff)
// ---------------------------------------------------------------------------

export type ProductInput = { slug: string; name: string; description: string; categoryId: number; status: ProductStatus }

export async function insertProduct(db: Db, input: ProductInput): Promise<number> {
  const result = await rows(
    db,
    z.object({ id: int8 }),
    q`INSERT INTO products (slug, name, description, category_id, status)
      VALUES (${input.slug}, ${input.name}, ${input.description}, ${input.categoryId}, ${input.status})
      RETURNING id`,
    'insertProduct',
  )
  return result[0]!.id
}

/** null = the version was stale (or the product is gone). */
export async function updateProduct(db: Db, id: number, version: number, patch: Partial<ProductInput>): Promise<boolean> {
  const result = await db.query(q`
    UPDATE products SET
      slug = COALESCE(${patch.slug ?? null}, slug),
      name = COALESCE(${patch.name ?? null}, name),
      description = COALESCE(${patch.description ?? null}, description),
      category_id = COALESCE(${patch.categoryId ?? null}::smallint, category_id),
      status = COALESCE(${patch.status ?? null}, status),
      version = version + 1
    WHERE id = ${id} AND version = ${version}
    RETURNING id`)
  return result.length > 0
}

export async function deleteProduct(db: Db, id: number): Promise<boolean> {
  return (await db.query(q`DELETE FROM products WHERE id = ${id} RETURNING id`)).length > 0
}

export type VariantInput = {
  sku: string
  size: string
  colour: string
  priceKobo: number
  compareAtPriceKobo: number | null
  stock: number
  status: 'active' | 'archived'
}

export async function insertVariant(db: Db, productId: number, input: VariantInput): Promise<number> {
  const result = await rows(
    db,
    z.object({ id: int8 }),
    q`INSERT INTO product_variants (product_id, sku, size, colour, price_kobo, compare_at_price_kobo, stock, status)
      VALUES (${productId}, ${input.sku}, ${input.size}, ${input.colour}, ${input.priceKobo},
              ${input.compareAtPriceKobo}, ${input.stock}, ${input.status})
      RETURNING id`,
    'insertVariant',
  )
  return result[0]!.id
}

/**
 * Optimistic concurrency again. compare_at uses a separate "was it sent?"
 * flag, because null is a meaningful value there ("no longer on sale").
 */
export async function updateVariant(
  db: Db,
  id: number,
  version: number,
  patch: Partial<Omit<VariantInput, 'compareAtPriceKobo'>> & { compareAtPriceKobo?: number | null },
): Promise<boolean> {
  const setCompareAt = patch.compareAtPriceKobo !== undefined
  const result = await db.query(q`
    UPDATE product_variants SET
      sku = COALESCE(${patch.sku ?? null}, sku),
      size = COALESCE(${patch.size ?? null}, size),
      colour = COALESCE(${patch.colour ?? null}, colour),
      price_kobo = COALESCE(${patch.priceKobo ?? null}::bigint, price_kobo),
      compare_at_price_kobo = CASE WHEN ${setCompareAt}::boolean THEN ${patch.compareAtPriceKobo ?? null}::bigint ELSE compare_at_price_kobo END,
      stock = COALESCE(${patch.stock ?? null}::int, stock),
      status = COALESCE(${patch.status ?? null}, status),
      version = version + 1
    WHERE id = ${id} AND version = ${version}
    RETURNING id`)
  return result.length > 0
}

export async function deleteVariant(db: Db, id: number): Promise<boolean> {
  return (await db.query(q`DELETE FROM product_variants WHERE id = ${id} RETURNING id`)).length > 0
}

export async function insertImage(db: Db, productId: number, input: { url: string; alt: string }): Promise<ImageRow> {
  // The next free position, worked out in the same statement.
  const result = await rows(
    db,
    ImageRow,
    q`INSERT INTO product_images (product_id, url, alt, position)
      VALUES (${productId}, ${input.url}, ${input.alt},
              (SELECT coalesce(max(position) + 1, 0) FROM product_images WHERE product_id = ${productId}))
      RETURNING id, product_id AS "productId", url, alt, position`,
    'insertImage',
  )
  return result[0]!
}

export async function deleteImage(db: Db, id: number): Promise<boolean> {
  return (await db.query(q`DELETE FROM product_images WHERE id = ${id} RETURNING id`)).length > 0
}

export async function findImage(db: Db, id: number): Promise<ImageRow | null> {
  return one(db, ImageRow, q`SELECT id, product_id AS "productId", url, alt, position FROM product_images WHERE id = ${id}`, 'findImage')
}
