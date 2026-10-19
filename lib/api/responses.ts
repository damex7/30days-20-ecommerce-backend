// RESPONSE SCHEMAS AND SERIALISERS: what every /api/v1 answer looks like.
//
// Each resource has a Zod schema (its exact public shape, which feeds the
// OpenAPI document) and a function that builds it from what the service
// returned. The handler parses every body against its schema before
// sending, so a field can't appear, vanish or change type by accident: the
// shape clients see is the shape the docs promise.
//
// Rules: snake_case, money in integer *_kobo with a "currency": "NGN" on the
// resource, timestamps as ISO 8601 strings in UTC, ids as numbers (uuids
// for users and API keys), and `version` on everything that can be PATCHed.
import 'server-only'

import { z } from 'zod'
import type { ApiKeyRow } from '@/lib/repos/api-keys'
import type { AddressRow, DeliveryFeeRow } from '@/lib/repos/addresses'
import type { CategoryRow } from '@/lib/repos/categories'
import type { CouponRow } from '@/lib/repos/coupons'
import type { OrderEventRow, OrderItemRow, OrderRow, OrderStatus } from '@/lib/repos/orders'
import type { PaymentEventRow } from '@/lib/repos/payment-events'
import type { ImageRow, ProductSummaryRow, VariantRow } from '@/lib/repos/products'
import type { AdminUserRow } from '@/lib/repos/users'
import type { User } from '@/lib/rows'
import type { ApiKeyPrincipal } from '@/lib/services/actor'
import type { CartView } from '@/lib/services/cart'
import type { ProductDetail } from '@/lib/services/catalog'
import { couponState } from '@/lib/services/coupons'
import type { OrderDetail } from '@/lib/services/orders'
import { API_SCOPES, ORDER_STATUSES, PRODUCT_STATUSES } from './requests'

const iso = z.iso.datetime().meta({ description: 'ISO 8601, UTC' })
const isoOrNull = iso.nullable()
const currency = z.literal('NGN')
const koboInt = z.int().meta({ description: 'kobo (₦1 = 100 kobo)' })
const toIso = (d: Date) => d.toISOString()
const toIsoOrNull = (d: Date | null) => (d ? d.toISOString() : null)

/** Every list: { data, next_cursor }. next_cursor is null on the last page. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable().meta({ description: 'Pass as ?cursor= to get the next page. null = this was the last page.' }),
  })
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const CategorySchema = z.object({
  id: z.int(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  position: z.int(),
  product_count: z.int(),
  version: z.int(),
})
export const categoryJson = (c: CategoryRow): z.infer<typeof CategorySchema> => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  position: c.position,
  product_count: c.productCount,
  version: c.version,
})

const ImageSchema = z.object({ id: z.int(), url: z.string(), alt: z.string(), position: z.int() })
const imageJson = (i: ImageRow): z.infer<typeof ImageSchema> => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })
export { ImageSchema, imageJson }

export const ProductSummarySchema = z.object({
  id: z.int(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(PRODUCT_STATUSES),
  category: z.object({ id: z.int(), slug: z.string(), name: z.string() }),
  currency,
  price_from_kobo: koboInt.nullable().meta({ description: 'The cheapest active variant. null = no variant on sale yet.' }),
  compare_at_from_kobo: koboInt.nullable().meta({ description: 'The "was" price of that variant, when it is on sale.' }),
  on_sale: z.boolean(),
  in_stock: z.boolean(),
  stock_total: z.int().meta({ description: 'Units on the shelf across active variants (for "Only 2 left").' }),
  image: ImageSchema.omit({ id: true, position: true }).nullable(),
  version: z.int(),
  created_at: iso,
  updated_at: iso,
})
export function productSummaryJson(p: ProductSummaryRow): z.infer<typeof ProductSummarySchema> {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    category: { id: p.categoryId, slug: p.categorySlug, name: p.categoryName },
    currency: 'NGN',
    price_from_kobo: p.priceFromKobo,
    compare_at_from_kobo: p.compareAtFromKobo,
    on_sale: p.compareAtFromKobo !== null,
    in_stock: p.inStock,
    stock_total: p.stockTotal,
    image: p.imageUrl && p.imageAlt ? { url: p.imageUrl, alt: p.imageAlt } : null,
    version: p.version,
    created_at: toIso(p.createdAt),
    updated_at: toIso(p.updatedAt),
  }
}

export const VariantSchema = z.object({
  id: z.int(),
  product_id: z.int(),
  sku: z.string(),
  size: z.string(),
  colour: z.string(),
  currency,
  price_kobo: koboInt,
  compare_at_price_kobo: koboInt.nullable(),
  stock: z.int(),
  in_stock: z.boolean(),
  status: z.enum(['active', 'archived']),
  version: z.int(),
})
export const variantJson = (v: VariantRow): z.infer<typeof VariantSchema> => ({
  id: v.id,
  product_id: v.productId,
  sku: v.sku,
  size: v.size,
  colour: v.colour,
  currency: 'NGN',
  price_kobo: v.priceKobo,
  compare_at_price_kobo: v.compareAtPriceKobo,
  stock: v.stock,
  in_stock: v.stock > 0 && v.status === 'active',
  status: v.status,
  version: v.version,
})

export const ProductDetailSchema = ProductSummarySchema.extend({
  description: z.string(),
  variants: z.array(VariantSchema),
  images: z.array(ImageSchema),
})
export const productDetailJson = (p: ProductDetail): z.infer<typeof ProductDetailSchema> => ({
  ...productSummaryJson(p),
  description: p.description,
  variants: p.variants.map(variantJson),
  images: p.images.map(imageJson),
})

// ---------------------------------------------------------------------------
// Cart, addresses, delivery
// ---------------------------------------------------------------------------

export const CartSchema = z.object({
  id: z.int(),
  currency,
  items: z.array(
    z.object({
      id: z.int(),
      variant_id: z.int(),
      product: z.object({ id: z.int(), slug: z.string(), name: z.string() }),
      sku: z.string(),
      size: z.string(),
      colour: z.string(),
      image: z.object({ url: z.string(), alt: z.string() }).nullable(),
      unit_price_kobo: koboInt.meta({ description: 'The LIVE price, read just now.' }),
      compare_at_price_kobo: koboInt.nullable(),
      quantity: z.int(),
      line_total_kobo: koboInt,
      available: z.int().meta({ description: 'How many can be bought right now.' }),
      problem: z.enum(['unavailable', 'insufficient_stock']).nullable(),
    }),
  ),
  item_count: z.int(),
  subtotal_kobo: koboInt,
  coupon: z.object({ code: z.string(), discount_kobo: koboInt, problem: z.string().nullable() }).nullable(),
  discount_kobo: koboInt,
  delivery: z.object({ state: z.string(), fee_kobo: koboInt, min_days: z.int(), max_days: z.int() }).nullable().meta({ description: 'Present when ?address_id= is given.' }),
  total_kobo: koboInt,
  ready: z.boolean().meta({ description: 'false while any item has a problem, the coupon fails, or the cart is empty.' }),
})
export const cartJson = (c: CartView): z.infer<typeof CartSchema> => ({
  id: c.id,
  currency: 'NGN',
  items: c.lines.map((l) => ({
    id: l.itemId,
    variant_id: l.variantId,
    product: { id: l.productId, slug: l.productSlug, name: l.productName },
    sku: l.sku,
    size: l.size,
    colour: l.colour,
    image: l.imageUrl && l.imageAlt ? { url: l.imageUrl, alt: l.imageAlt } : null,
    unit_price_kobo: l.priceKobo,
    compare_at_price_kobo: l.compareAtPriceKobo,
    quantity: l.quantity,
    line_total_kobo: l.lineTotalKobo,
    available: l.available,
    problem: l.problem,
  })),
  item_count: c.itemCount,
  subtotal_kobo: c.subtotalKobo,
  coupon: c.coupon ? { code: c.coupon.code, discount_kobo: c.coupon.discountKobo, problem: c.coupon.problem } : null,
  discount_kobo: c.discountKobo,
  delivery: c.delivery ? { state: c.delivery.state, fee_kobo: c.delivery.feeKobo, min_days: c.delivery.minDays, max_days: c.delivery.maxDays } : null,
  total_kobo: c.totalKobo,
  ready: c.ready,
})

export const AddressSchema = z.object({
  id: z.int(),
  label: z.string().nullable(),
  recipient_name: z.string(),
  phone: z.string().meta({ description: '+234XXXXXXXXXX' }),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  landmark: z.string().nullable(),
  is_default: z.boolean(),
  version: z.int(),
  created_at: iso,
  updated_at: iso,
})
export const addressJson = (a: AddressRow): z.infer<typeof AddressSchema> => ({
  id: a.id,
  label: a.label,
  recipient_name: a.recipientName,
  phone: a.phone,
  street: a.street,
  city: a.city,
  state: a.state,
  landmark: a.landmark,
  is_default: a.isDefault,
  version: a.version,
  created_at: toIso(a.createdAt),
  updated_at: toIso(a.updatedAt),
})

export const DeliveryFeeSchema = z.object({ state: z.string(), currency, fee_kobo: koboInt, min_days: z.int(), max_days: z.int(), version: z.int() })
export const deliveryFeeJson = (f: DeliveryFeeRow): z.infer<typeof DeliveryFeeSchema> => ({
  state: f.state,
  currency: 'NGN',
  fee_kobo: f.feeKobo,
  min_days: f.minDays,
  max_days: f.maxDays,
  version: f.version,
})

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const OrderSchema = z.object({
  id: z.int(),
  number: z.string().meta({ description: 'OJA-2026-000123' }),
  status: z.enum(ORDER_STATUSES),
  currency,
  subtotal_kobo: koboInt,
  discount_kobo: koboInt,
  delivery_fee_kobo: koboInt,
  total_kobo: koboInt.meta({ description: 'subtotal − discount + delivery (a CHECK in the database).' }),
  coupon_code: z.string().nullable(),
  item_count: z.int(),
  customer: z.object({ id: z.uuid().nullable(), name: z.string(), email: z.string() }),
  shipping_address: z.object({ recipient_name: z.string(), phone: z.string(), street: z.string(), city: z.string(), state: z.string(), landmark: z.string().nullable() }).meta({
    description: 'COPIED at checkout: later edits to the address book don’t change it.',
  }),
  delivery_days: z.object({ min: z.int(), max: z.int() }),
  paystack_reference: z.string(),
  paid_at: isoOrNull,
  expires_at: isoOrNull.meta({ description: 'Unpaid orders are cancelled (and their stock released) after this.' }),
  cancelled_at: isoOrNull,
  is_demo: z.boolean(),
  version: z.int(),
  created_at: iso,
  updated_at: iso,
})
export const orderJson = (o: OrderRow): z.infer<typeof OrderSchema> => ({
  id: o.id,
  number: o.number,
  status: o.status,
  currency: 'NGN',
  subtotal_kobo: o.subtotalKobo,
  discount_kobo: o.discountKobo,
  delivery_fee_kobo: o.deliveryFeeKobo,
  total_kobo: o.totalKobo,
  coupon_code: o.couponCode,
  item_count: o.itemCount,
  customer: { id: o.customerId, name: o.customerName, email: o.customerEmail },
  shipping_address: { recipient_name: o.shipRecipient, phone: o.shipPhone, street: o.shipStreet, city: o.shipCity, state: o.shipState, landmark: o.shipLandmark },
  delivery_days: { min: o.deliveryMinDays, max: o.deliveryMaxDays },
  paystack_reference: o.paystackReference,
  paid_at: toIsoOrNull(o.paidAt),
  expires_at: toIsoOrNull(o.expiresAt),
  cancelled_at: toIsoOrNull(o.cancelledAt),
  is_demo: o.isDemo,
  version: o.version,
  created_at: toIso(o.createdAt),
  updated_at: toIso(o.updatedAt),
})

export const OrderItemSchema = z.object({
  id: z.int(),
  variant_id: z.int(),
  product_name: z.string().meta({ description: 'COPIED at purchase.' }),
  product_slug: z.string(),
  variant_label: z.string(),
  sku: z.string(),
  unit_price_kobo: koboInt.meta({ description: 'COPIED at purchase: the price actually paid.' }),
  quantity: z.int(),
  line_total_kobo: koboInt,
})
const orderItemJson = (i: OrderItemRow): z.infer<typeof OrderItemSchema> => ({
  id: i.id,
  variant_id: i.variantId,
  product_name: i.productName,
  product_slug: i.productSlug,
  variant_label: i.variantLabel,
  sku: i.sku,
  unit_price_kobo: i.unitPriceKobo,
  quantity: i.quantity,
  line_total_kobo: i.lineTotalKobo,
})

export const OrderDetailSchema = OrderSchema.extend({
  items: z.array(OrderItemSchema),
  next_statuses: z.array(z.enum(ORDER_STATUSES)).meta({ description: 'The moves YOU may make next (POST /orders/{id}/transitions).' }),
})
export const orderDetailJson = (o: OrderDetail, nextStatuses: OrderStatus[]): z.infer<typeof OrderDetailSchema> => ({
  ...orderJson(o),
  items: o.items.map(orderItemJson),
  next_statuses: nextStatuses,
})

export const OrderEventSchema = z.object({
  id: z.int(),
  type: z.enum(['created', 'status_changed', 'payment_received', 'note_added']),
  from_status: z.enum(ORDER_STATUSES).nullable(),
  to_status: z.enum(ORDER_STATUSES).nullable(),
  note: z.string().nullable(),
  actor: z.string().meta({ description: 'Who did it, as it was at the time ("Ada (staff)", "Paystack").' }),
  metadata: z.record(z.string(), z.unknown()),
  created_at: iso,
})
export const orderEventJson = (e: OrderEventRow): z.infer<typeof OrderEventSchema> => ({
  id: e.id,
  type: e.type,
  from_status: e.fromStatus,
  to_status: e.toStatus,
  note: e.note,
  actor: e.actorLabel,
  metadata: e.metadata,
  created_at: toIso(e.createdAt),
})

export const PaymentStartSchema = z.object({
  authorization_url: z.url().meta({ description: 'Send the customer here to pay on Paystack.' }),
  reference: z.string(),
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const CouponSchema = z.object({
  id: z.int(),
  code: z.string(),
  description: z.string(),
  kind: z.enum(['percent', 'fixed']),
  value: z.int().meta({ description: 'percent: 1–100. fixed: kobo.' }),
  currency,
  min_order_kobo: koboInt,
  max_uses: z.int().nullable(),
  uses: z.int(),
  per_customer_limit: z.int().nullable(),
  starts_at: isoOrNull,
  ends_at: isoOrNull,
  active: z.boolean(),
  state: z.enum(['active', 'scheduled', 'expired', 'used_up', 'paused']),
  version: z.int(),
  created_at: iso,
  updated_at: iso,
})
export const couponJson = (c: CouponRow): z.infer<typeof CouponSchema> => ({
  id: c.id,
  code: c.code,
  description: c.description,
  kind: c.kind,
  value: c.value,
  currency: 'NGN',
  min_order_kobo: c.minOrderKobo,
  max_uses: c.maxUses,
  uses: c.uses,
  per_customer_limit: c.perCustomerLimit,
  starts_at: toIsoOrNull(c.startsAt),
  ends_at: toIsoOrNull(c.endsAt),
  active: c.active,
  state: couponState(c),
  version: c.version,
  created_at: toIso(c.createdAt),
  updated_at: toIso(c.updatedAt),
})

export const ApiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string().meta({ description: 'The first characters, to tell keys apart. The full key is never shown again.' }),
  scopes: z.array(z.enum(API_SCOPES)),
  is_demo: z.boolean(),
  created_by: z.object({ id: z.uuid(), name: z.string() }),
  last_used_at: isoOrNull,
  expires_at: isoOrNull,
  revoked_at: isoOrNull,
  created_at: iso,
})
export const apiKeyJson = (k: ApiKeyRow): z.infer<typeof ApiKeySchema> => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: k.scopes,
  is_demo: k.isDemo,
  created_by: { id: k.createdById, name: k.createdByName },
  last_used_at: toIsoOrNull(k.lastUsedAt),
  expires_at: toIsoOrNull(k.expiresAt),
  revoked_at: toIsoOrNull(k.revokedAt),
  created_at: toIso(k.createdAt),
})
export const ApiKeyCreatedSchema = ApiKeySchema.extend({
  secret: z.string().meta({ description: 'The key itself, shown ONCE. Store it now: only its hash is kept.' }),
})

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  role: z.enum(['customer', 'staff', 'admin']),
  email_verified: z.boolean(),
  active: z.boolean(),
  is_demo: z.boolean(),
  order_count: z.int(),
  created_at: iso,
})
export const adminUserJson = (u: AdminUserRow): z.infer<typeof AdminUserSchema> => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  role: u.role,
  email_verified: u.emailVerifiedAt !== null,
  active: u.deactivatedAt === null,
  is_demo: u.isDemo,
  order_count: u.orderCount,
  created_at: toIso(u.createdAt),
})

export const PaymentEventSchema = z.object({
  id: z.int(),
  event_id: z.string(),
  source: z.enum(['webhook', 'callback']),
  event_type: z.string(),
  reference: z.string().nullable(),
  order: z.object({ id: z.int(), number: z.string().nullable() }).nullable(),
  amount_kobo: koboInt.nullable(),
  currency: z.string().nullable(),
  outcome: z.string().nullable(),
  detail: z.string().nullable(),
  received_at: iso,
  processed_at: isoOrNull,
})
export const paymentEventJson = (e: PaymentEventRow): z.infer<typeof PaymentEventSchema> => ({
  id: e.id,
  event_id: e.eventId,
  source: e.source,
  event_type: e.eventType,
  reference: e.reference,
  order: e.orderId !== null ? { id: e.orderId, number: e.orderNumber } : null,
  amount_kobo: e.amountKobo,
  currency: e.currency,
  outcome: e.outcome,
  detail: e.detail,
  received_at: toIso(e.receivedAt),
  processed_at: toIsoOrNull(e.processedAt),
})

// ---------------------------------------------------------------------------
// /me
// ---------------------------------------------------------------------------

export const MeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    id: z.uuid(),
    email: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    role: z.enum(['customer', 'staff', 'admin']),
    email_verified: z.boolean(),
    is_demo: z.boolean(),
  }),
  z.object({ kind: z.literal('api_key'), id: z.uuid(), name: z.string(), prefix: z.string(), scopes: z.array(z.enum(API_SCOPES)), is_demo: z.boolean() }),
])
export const meUserJson = (u: User): z.infer<typeof MeSchema> => ({
  kind: 'user',
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  role: u.role,
  email_verified: u.emailVerifiedAt !== null,
  is_demo: u.isDemo,
})
export const meKeyJson = (k: ApiKeyPrincipal): z.infer<typeof MeSchema> => ({ kind: 'api_key', id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, is_demo: k.isDemo })

// ---------------------------------------------------------------------------
// Errors (RFC 9457)
// ---------------------------------------------------------------------------

export const ProblemSchema = z
  .object({
    type: z.string().meta({ description: 'A URI naming the kind of problem; open it for an explanation.' }),
    title: z.string(),
    status: z.int(),
    detail: z.string(),
    instance: z.string().optional(),
    request_id: z.string(),
    errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  })
  .catchall(z.unknown())
  .meta({ description: 'application/problem+json (RFC 9457)' })
