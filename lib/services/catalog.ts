// THE CATALOGUE: what visitors can browse, and what staff can change.
import 'server-only'

import { http } from '@/lib/db/executor'
import { isCheckError, isReferencedError, isUniqueError } from '@/lib/db/errors'
import { withTransaction } from '@/lib/db/tx'
import { decodeCursor, encodeCursor, toPage, type Page } from '@/lib/pagination'
import * as categories from '@/lib/repos/categories'
import * as repo from '@/lib/repos/products'
import type { ImageRow, ProductDetailRow, ProductInput, ProductSort, ProductStatus, ProductSummaryRow, VariantInput, VariantRow } from '@/lib/repos/products'
import { isShopSide, type Actor } from './actor'
import { conflict, invalid, notFound, staleVersion } from './errors'
import { authorize, can } from './permissions'

export type ProductDetail = ProductDetailRow & { variants: VariantRow[]; images: ImageRow[] }

export type ProductListInput = {
  category?: string
  q?: string
  minPriceKobo?: number
  maxPriceKobo?: number
  size?: string
  colour?: string
  inStock?: boolean
  sort: ProductSort
  /** Staff only: list drafts or archived products too. */
  status?: ProductStatus
  cursor?: string
  limit: number
}

/** Which statuses this actor may see: shop people with the right permission see all; everyone else, active only. */
function visibleStatuses(actor: Actor, asked: ProductStatus | undefined): readonly ProductStatus[] {
  if (asked && asked !== 'active') {
    authorize(actor, 'catalog.read_all')
    return [asked]
  }
  return ['active']
}

/**
 * The product list. Public: anyone may call it (no authorize), and it only
 * ever returns ACTIVE products unless a staff member asks for a status.
 */
export async function listProducts(actor: Actor, input: ProductListInput): Promise<Page<ProductSummaryRow>> {
  const statuses = visibleStatuses(actor, input.status)
  // The cursor is tied to the sort AND to every filter (lib/pagination.ts).
  const filters = { category: input.category, q: input.q, min: input.minPriceKobo, max: input.maxPriceKobo, size: input.size, colour: input.colour, inStock: input.inStock, status: statuses.join(',') }
  const key = input.cursor ? decodeCursor(input.cursor, input.sort, filters) : null
  const after = key
    ? input.sort === 'newest'
      ? { ts: String(key[0]), id: Number(key[1]) }
      : { price: Number(key[0]), id: Number(key[1]) }
    : undefined

  const result = await repo.listProducts(http, {
    statuses,
    categorySlug: input.category,
    search: input.q,
    minPriceKobo: input.minPriceKobo,
    maxPriceKobo: input.maxPriceKobo,
    size: input.size,
    colour: input.colour,
    inStock: input.inStock,
    sort: input.sort,
    after,
    limit: input.limit,
  })
  return toPage(result, input.limit, (last) =>
    encodeCursor(input.sort, filters, input.sort === 'newest' ? [last.cursorTs, last.id] : [last.priceFromKobo ?? 0, last.id]),
  )
}

export function listFacets(): Promise<{ sizes: string[]; colours: string[] }> {
  return repo.listFacets(http)
}

export function listCategories() {
  return categories.listCategories(http)
}

async function withParts(product: ProductDetailRow, includeArchivedVariants: boolean): Promise<ProductDetail> {
  const [variants, images] = await Promise.all([repo.listVariants(http, [product.id], includeArchivedVariants), repo.listImages(http, [product.id])])
  return { ...product, variants, images }
}

/** One product by slug. Drafts and archived products are 404 to everyone except shop people. */
export async function getProductBySlug(actor: Actor, slug: string): Promise<ProductDetail> {
  const shop = isShopSide(actor) && can(actor, 'catalog.read_all')
  const product = await repo.findProductBySlug(http, slug, shop ? ['draft', 'active', 'archived'] : ['active'])
  if (!product) throw notFound('Product')
  return withParts(product, shop)
}

/** Staff: one product by id, in any status, with archived variants. */
export async function getProductById(actor: Actor, id: number): Promise<ProductDetail> {
  authorize(actor, 'catalog.read_all')
  const product = await repo.findProductById(http, id)
  if (!product) throw notFound('Product')
  return withParts(product, true)
}

// ---------------------------------------------------------------------------
// Writes (staff, admin, or an API key with catalog:write)
// ---------------------------------------------------------------------------

/** Turns the database's refusals into answers a client can act on. */
function explainWriteError(error: unknown): never {
  if (isUniqueError(error, 'products_slug_key')) throw conflict('slug_taken', 'Another product already uses that slug. Choose a different one.')
  if (isUniqueError(error, 'product_variants_sku_key')) throw conflict('sku_taken', 'Another variant already uses that SKU.')
  if (isUniqueError(error, 'product_variants_product_size_colour_key')) throw conflict('variant_exists', 'This product already has a variant in that size and colour.')
  if (isUniqueError(error, 'categories_slug_key')) throw conflict('slug_taken', 'Another category already uses that slug.')
  if (isCheckError(error, 'product_variants_compare_at_price_kobo_check')) {
    throw invalid('validation_failed', 'The “was” price must be higher than the price.', [{ field: 'compare_at_price_kobo', message: 'Make it higher than the price, or leave it empty.' }])
  }
  if (isReferencedError(error)) throw invalid('unknown_category', 'That category doesn’t exist.', [{ field: 'category_id', message: 'Choose an existing category.' }])
  throw error
}

export async function createProduct(actor: Actor, input: ProductInput): Promise<ProductDetail> {
  authorize(actor, 'catalog.write')
  try {
    const id = await repo.insertProduct(http, input)
    return getProductById(actor, id)
  } catch (error) {
    explainWriteError(error)
  }
}

export async function updateProduct(actor: Actor, id: number, version: number, patch: Partial<ProductInput>): Promise<ProductDetail> {
  authorize(actor, 'catalog.write')
  let updated: boolean
  try {
    updated = await repo.updateProduct(http, id, version, patch)
  } catch (error) {
    explainWriteError(error)
  }
  if (!updated) {
    const current = await repo.findProductById(http, id)
    if (!current) throw notFound('Product')
    throw staleVersion('product', current.version)
  }
  return getProductById(actor, id)
}

/**
 * DELETE versus ARCHIVE. A product that has never been ordered can really
 * be deleted (a typo, a test). One that has been ordered must stay, because
 * order_items point at its variants (ON DELETE RESTRICT): we answer 409 and
 * say to archive it instead (PATCH status=archived). The RESTRICT is the
 * real guard; the question first just gives a clearer answer.
 */
export async function deleteProduct(actor: Actor, id: number): Promise<void> {
  authorize(actor, 'catalog.write')
  const product = await repo.findProductById(http, id)
  if (!product) throw notFound('Product')
  const ordered = await repo.hasBeenOrdered(http, { productId: id })
  const archiveInstead = () =>
    conflict('has_orders', 'This product appears in orders, so it can’t be deleted. Archive it instead (status: archived): it disappears from the shop and order history stays intact.')
  if (ordered) throw archiveInstead()
  try {
    await repo.deleteProduct(http, id)
  } catch (error) {
    if (isReferencedError(error)) throw archiveInstead()
    throw error
  }
}

export async function createVariant(actor: Actor, productId: number, input: VariantInput): Promise<VariantRow> {
  authorize(actor, 'catalog.write')
  const product = await repo.findProductById(http, productId)
  if (!product) throw notFound('Product')
  try {
    const id = await repo.insertVariant(http, productId, input)
    const variant = await repo.findVariant(http, id)
    if (!variant) throw notFound('Variant')
    return variant
  } catch (error) {
    explainWriteError(error)
  }
}

export async function getVariant(actor: Actor, id: number): Promise<VariantRow> {
  authorize(actor, 'catalog.read_all')
  const variant = await repo.findVariant(http, id)
  if (!variant) throw notFound('Variant')
  return variant
}

export type VariantPatch = Partial<Omit<VariantInput, 'compareAtPriceKobo'>> & { compareAtPriceKobo?: number | null }

export async function updateVariant(actor: Actor, id: number, version: number, patch: VariantPatch): Promise<VariantRow> {
  authorize(actor, 'catalog.write')
  // Price and compare-at checked together, against what's stored, so a
  // PATCH of only one of them can't break the "was > now" rule.
  const current = await repo.findVariant(http, id)
  if (!current) throw notFound('Variant')
  const price = patch.priceKobo ?? current.priceKobo
  const compareAt = patch.compareAtPriceKobo !== undefined ? patch.compareAtPriceKobo : current.compareAtPriceKobo
  if (compareAt !== null && compareAt <= price) {
    throw invalid('validation_failed', 'The “was” price must be higher than the price.', [{ field: 'compare_at_price_kobo', message: 'Make it higher than the price, or set it to null.' }])
  }
  let updated: boolean
  try {
    updated = await repo.updateVariant(http, id, version, patch)
  } catch (error) {
    explainWriteError(error)
  }
  if (!updated) throw staleVersion('variant', current.version)
  const variant = await repo.findVariant(http, id)
  if (!variant) throw notFound('Variant')
  return variant
}

export async function deleteVariant(actor: Actor, id: number): Promise<void> {
  authorize(actor, 'catalog.write')
  const variant = await repo.findVariant(http, id)
  if (!variant) throw notFound('Variant')
  const archiveInstead = () => conflict('has_orders', 'This variant appears in orders, so it can’t be deleted. Archive it instead (status: archived).')
  if (await repo.hasBeenOrdered(http, { variantId: id })) throw archiveInstead()
  try {
    await repo.deleteVariant(http, id)
  } catch (error) {
    if (isReferencedError(error)) throw archiveInstead()
    throw error
  }
}

export async function addImage(actor: Actor, productId: number, input: { url: string; alt: string }): Promise<ImageRow> {
  authorize(actor, 'catalog.write')
  return withTransaction(async (tx) => {
    const product = await repo.findProductById(tx, productId)
    if (!product) throw notFound('Product')
    return repo.insertImage(tx, productId, input)
  })
}

export async function deleteImage(actor: Actor, id: number): Promise<void> {
  authorize(actor, 'catalog.write')
  if (!(await repo.deleteImage(http, id))) throw notFound('Image')
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(actor: Actor, input: categories.CategoryInput) {
  authorize(actor, 'catalog.write')
  try {
    const category = await categories.insertCategory(http, input)
    if (!category) throw new Error('insertCategory returned nothing')
    return category
  } catch (error) {
    explainWriteError(error)
  }
}

export async function updateCategory(actor: Actor, id: number, version: number, patch: Partial<categories.CategoryInput>) {
  authorize(actor, 'catalog.write')
  let category: categories.CategoryRow | null
  try {
    category = await categories.updateCategory(http, id, version, patch)
  } catch (error) {
    explainWriteError(error)
  }
  if (!category) {
    const current = await categories.findCategory(http, id)
    if (!current) throw notFound('Category')
    throw staleVersion('category', current.version)
  }
  return category
}
