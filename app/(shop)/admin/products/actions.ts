// STAFF PRODUCT ACTIONS: the same services and the same Zod request schemas
// as the catalogue endpoints of /api/v1. Prices are TYPED IN NAIRA on the
// page ("45,000") and turned into integer kobo by parseNaira (text in,
// whole kobo out, never a float) before the API schema sees them.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fromServiceError, fromZodError, readId } from '@/lib/action-helpers'
import { createImageBody, createProductBody, createVariantBody, updateProductBody, updateVariantBody } from '@/lib/api/requests'
import { parseNaira } from '@/lib/money'
import { addImage, createProduct, createVariant, deleteImage, deleteProduct, deleteVariant, updateProduct, updateVariant } from '@/lib/services/catalog'
import { requireShopActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

const PRODUCT_FIELDS = ['name', 'slug', 'description', 'category_id', 'status'] as const
type ProductField = (typeof PRODUCT_FIELDS)[number]

function productValues(formData: FormData) {
  return Object.fromEntries(PRODUCT_FIELDS.map((n) => [n, field(formData, n)])) as Record<ProductField, string>
}

/** "Ọ̀nà penny loafer" → "ona-penny-loafer": strips accents and dots below. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function saveProduct(_previous: FormState<ProductField>, formData: FormData): Promise<FormState<ProductField>> {
  const actor = await requireShopActor()
  const values = productValues(formData)
  const id = readId(formData)
  const body = { ...values, slug: values.slug || slugify(values.name), category_id: Number(values.category_id) || undefined }
  try {
    if (id) {
      const parsed = updateProductBody.safeParse({ ...body, version: Number(field(formData, 'version')) })
      if (!parsed.success) return fromZodError(parsed.error, values)
      await updateProduct(actor, id, parsed.data.version, parsed.data.patch)
    } else {
      const parsed = createProductBody.safeParse(body)
      if (!parsed.success) return fromZodError(parsed.error, values)
      const product = await createProduct(actor, parsed.data)
      redirect(`/admin/products/${product.id}?notice=created`)
    }
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return { status: 'success', message: 'Product saved.', submissionId: Date.now() }
}

export async function removeProduct(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireShopActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That product no longer exists.', submissionId: Date.now() }
  try {
    await deleteProduct(actor, id)
  } catch (error) {
    const state = fromServiceError(error)
    // "It has orders": offer Archive instead (Day 18's pattern).
    return { ...state, offerArchive: state.message?.includes('Archive it instead') ?? false }
  }
  redirect('/admin/products?notice=deleted')
}

export async function archiveProduct(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireShopActor()
  const id = readId(formData)
  if (!id) return { status: 'error', message: 'That product no longer exists.', submissionId: Date.now() }
  try {
    await updateProduct(actor, id, Number(field(formData, 'version')), { status: 'archived' })
  } catch (error) {
    return fromServiceError(error)
  }
  redirect(`/admin/products/${id}?notice=archived`)
}

const VARIANT_FIELDS = ['sku', 'size', 'colour', 'price', 'compare_at', 'stock', 'status'] as const
export type VariantField = (typeof VARIANT_FIELDS)[number] | 'price_kobo' | 'compare_at_price_kobo'

function moneyError(name: 'price' | 'compare_at', values: Record<string, string>): FormState<VariantField> {
  return { status: 'error', message: 'Please fix the problems below.', fieldErrors: { [name]: ['Enter an amount in Naira, like 45,000 or 45000.50'] }, values, submissionId: Date.now() }
}

export async function saveVariant(_previous: FormState<VariantField>, formData: FormData): Promise<FormState<VariantField>> {
  const actor = await requireShopActor()
  const values = Object.fromEntries(VARIANT_FIELDS.map((n) => [n, field(formData, n)])) as Record<(typeof VARIANT_FIELDS)[number], string>
  const price = values.price ? parseNaira(values.price) : undefined
  if (price === null) return moneyError('price', values)
  const compareAt = values.compare_at ? parseNaira(values.compare_at) : null
  if (values.compare_at && compareAt === null) return moneyError('compare_at', values)
  const body = {
    sku: values.sku || undefined,
    size: values.size || undefined,
    colour: values.colour || undefined,
    price_kobo: price,
    compare_at_price_kobo: compareAt,
    stock: values.stock === '' ? undefined : Number(values.stock),
    status: values.status || undefined,
  }
  const variantId = readId(formData, 'variant_id')
  try {
    if (variantId) {
      const parsed = updateVariantBody.safeParse({ ...body, version: Number(field(formData, 'version')) })
      if (!parsed.success) return fromZodError(parsed.error, values)
      await updateVariant(actor, variantId, parsed.data.version, parsed.data.patch)
    } else {
      const productId = readId(formData, 'product_id')
      if (!productId) return { status: 'error', message: 'That product no longer exists.', submissionId: Date.now() }
      const parsed = createVariantBody.safeParse(body)
      if (!parsed.success) return fromZodError(parsed.error, values)
      await createVariant(actor, productId, parsed.data)
    }
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return { status: 'success', message: variantId ? `Saved ${values.sku || 'the variant'}.` : 'Variant added.', submissionId: Date.now() }
}

export async function removeVariant(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireShopActor()
  const id = readId(formData, 'variant_id')
  if (!id) return { status: 'error', message: 'That variant no longer exists.', submissionId: Date.now() }
  try {
    await deleteVariant(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return { status: 'success', message: 'Variant deleted.', submissionId: Date.now() }
}

export async function saveImage(_previous: FormState<'url' | 'alt'>, formData: FormData): Promise<FormState<'url' | 'alt'>> {
  const actor = await requireShopActor()
  const productId = readId(formData, 'product_id')
  const values = { url: field(formData, 'url'), alt: field(formData, 'alt') }
  if (!productId) return { status: 'error', message: 'That product no longer exists.', submissionId: Date.now() }
  const parsed = createImageBody.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await addImage(actor, productId, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return { status: 'success', message: 'Image added.', submissionId: Date.now() }
}

export async function removeImage(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireShopActor()
  const id = readId(formData, 'image_id')
  if (!id) return { status: 'error', message: 'That image no longer exists.', submissionId: Date.now() }
  try {
    await deleteImage(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return { status: 'success', message: 'Image removed.', submissionId: Date.now() }
}
