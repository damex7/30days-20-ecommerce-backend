// REQUEST SCHEMAS: every input to /api/v1 (and to my own forms) is parsed by
// one of these before any service sees it. Types come from z.infer, and
// the OpenAPI document is generated from these same objects
// (lib/api/openapi.ts), so the docs can't drift from the validation.
//
// JSON CASING: snake_case everywhere in the API (price_kobo, next_cursor).
// It matches the database columns and Paystack's own payloads, it's what
// most public REST APIs use (Stripe, GitHub), and it reads the same in
// every client language. Inside the TypeScript code things are camelCase;
// each schema's .transform() is the one place that converts, so the
// services only ever see camelCase input.
//
// MONEY is always whole kobo (integers) plus currency "NGN" in responses.
// ₦45,000 is sent as 4500000. No floats, no strings with commas.
import { z } from 'zod'
import { optionalPhone } from '@/lib/validation'
import { normalizeNigerianPhone } from '@/lib/phone'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const MAX_KOBO = 10_000_000_000 // ₦100 million
const kobo = (description: string) => z.int().min(0).max(MAX_KOBO).meta({ description: `${description}, in kobo (₦1 = 100 kobo)` })
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens, like "ona-loafer"').max(80)
const text = (max: number, label: string) => z.string({ error: `Enter ${label}` }).trim().min(1, `Enter ${label}`).max(max, `Use ${max} characters or fewer`)
export const versionField = z.int({ error: 'Send the version you last read' }).min(1).meta({ description: 'The version you last read. If someone else has changed it since, you get 409.' })

/** "true"/"false" from a query string. */
const boolString = z.enum(['true', 'false']).transform((v) => v === 'true')

/** A query-string integer. */
const queryInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max)

export const idParam = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const uuidParam = z.uuid()

export const paginationQuery = {
  cursor: z.string().max(600).optional().meta({ description: 'The next_cursor from the previous page. Omit for the first page.' }),
  limit: queryInt(1, 100).default(24).meta({ description: 'Items per page, 1–100 (default 24).' }),
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const
export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const

export const productListQuery = z
  .object({
    category: slug.optional().meta({ description: 'Category slug, e.g. "bags".' }),
    q: z.string().trim().min(1).max(100).optional().meta({ description: 'Full-text search over name and description ("tan loafer", "-suede").' }),
    min_price: queryInt(0, MAX_KOBO).optional().meta({ description: 'Lowest variant price, in kobo.' }),
    max_price: queryInt(0, MAX_KOBO).optional().meta({ description: 'Highest variant price, in kobo.' }),
    size: z.string().trim().min(1).max(20).optional().meta({ description: 'Only products with a variant in this size.' }),
    colour: z.string().trim().min(1).max(30).optional().meta({ description: 'Only products with a variant in this colour.' }),
    in_stock: boolString.optional().meta({ description: '"true" for products (or matching variants) with stock.' }),
    sort: z.enum(PRODUCT_SORTS).default('newest'),
    status: z.enum(PRODUCT_STATUSES).optional().meta({ description: 'Staff only (or a key with catalog:read): list draft or archived products.' }),
    ...paginationQuery,
  })
  .refine((v) => v.min_price === undefined || v.max_price === undefined || v.min_price <= v.max_price, { path: ['max_price'], message: 'max_price must be at least min_price' })
  .transform((v) => ({
    category: v.category,
    q: v.q,
    minPriceKobo: v.min_price,
    maxPriceKobo: v.max_price,
    size: v.size,
    colour: v.colour,
    inStock: v.in_stock,
    sort: v.sort,
    status: v.status,
    cursor: v.cursor,
    limit: v.limit,
  }))

export const createCategoryBody = z
  .object({
    slug,
    name: text(60, 'a name'),
    description: z.string().trim().max(500).default(''),
    position: z.int().min(0).max(1000).default(0),
  })
export const updateCategoryBody = z.object({
  slug: slug.optional(),
  name: text(60, 'a name').optional(),
  description: z.string().trim().max(500).optional(),
  position: z.int().min(0).max(1000).optional(),
  version: versionField,
})

const productFields = {
  slug,
  name: text(120, 'a product name'),
  description: z.string().trim().max(5000).default(''),
  category_id: z.int().min(1).meta({ description: 'The category id (GET /categories).' }),
  status: z.enum(PRODUCT_STATUSES).default('draft'),
}
export const createProductBody = z.object(productFields).transform((v) => ({ slug: v.slug, name: v.name, description: v.description, categoryId: v.category_id, status: v.status }))
export const updateProductBody = z
  .object({
    slug: productFields.slug.optional(),
    name: productFields.name.optional(),
    description: z.string().trim().max(5000).optional(),
    category_id: productFields.category_id.optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    version: versionField,
  })
  .transform(({ category_id, version, ...rest }) => ({ patch: { ...rest, categoryId: category_id }, version }))

const sku = z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'Use capital letters, numbers and hyphens, like ONA-LOAF-42-TAN').max(40)
const variantFields = {
  sku,
  size: text(20, 'a size'),
  colour: text(30, 'a colour'),
  price_kobo: kobo('The price'),
  compare_at_price_kobo: kobo('The "was" price shown struck through').nullable().default(null),
  stock: z.int().min(0).max(100_000),
  status: z.enum(['active', 'archived']).default('active'),
}
export const createVariantBody = z
  .object(variantFields)
  .refine((v) => v.compare_at_price_kobo === null || v.compare_at_price_kobo > v.price_kobo, { path: ['compare_at_price_kobo'], message: 'The “was” price must be higher than the price' })
  .transform((v) => ({ sku: v.sku, size: v.size, colour: v.colour, priceKobo: v.price_kobo, compareAtPriceKobo: v.compare_at_price_kobo, stock: v.stock, status: v.status }))
export const updateVariantBody = z
  .object({
    sku: sku.optional(),
    size: variantFields.size.optional(),
    colour: variantFields.colour.optional(),
    price_kobo: variantFields.price_kobo.optional(),
    compare_at_price_kobo: kobo('The "was" price (null = not on sale)').nullable().optional(),
    stock: variantFields.stock.optional(),
    status: z.enum(['active', 'archived']).optional(),
    version: versionField,
  })
  .transform((v) => ({
    version: v.version,
    patch: { sku: v.sku, size: v.size, colour: v.colour, priceKobo: v.price_kobo, compareAtPriceKobo: v.compare_at_price_kobo, stock: v.stock, status: v.status },
  }))

export const createImageBody = z.object({
  url: z.string().trim().max(500).regex(/^(\/[A-Za-z0-9/_.-]+|https:\/\/\S+)$/, 'Use a path in /public like /products/loafer.jpg, or an https:// URL'),
  alt: text(200, 'a description of the image for screen readers'),
})

// ---------------------------------------------------------------------------
// Cart, addresses
// ---------------------------------------------------------------------------

export const cartQuery = z.object({ address_id: idParam.optional().meta({ description: 'Include the delivery fee for this saved address.' }) }).transform((v) => ({ addressId: v.address_id }))

export const addCartItemBody = z
  .object({
    variant_id: z.int({ error: 'Choose a size and colour' }).min(1),
    quantity: z.int().min(1, 'Add at least one').max(20, 'You can buy up to 20 of one item').default(1),
  })
  .transform((v) => ({ variantId: v.variant_id, quantity: v.quantity }))

export const updateCartItemBody = z.object({ quantity: z.int().min(1, 'Use at least 1 (or remove the item)').max(20, 'You can buy up to 20 of one item') })

export const applyCouponBody = z.object({ code: z.string({ error: 'Enter a code' }).trim().min(1, 'Enter a code').max(32, 'Codes are at most 32 characters') })

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const

const requiredPhone = z
  .string({ error: 'Enter a phone number' })
  .trim()
  .min(1, 'Enter a phone number for the courier')
  .max(30)
  .transform((value, ctx) => {
    const normalised = normalizeNigerianPhone(value)
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number like 0803 123 4567' })
      return z.NEVER
    }
    return normalised
  })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .nullable()
    .transform((v) => (v ? v : null))

const addressFields = {
  label: optionalText(40).default(null),
  recipient_name: text(100, 'who will receive it'),
  phone: requiredPhone,
  street: z.string({ error: 'Enter the street address' }).trim().min(3, 'Enter the street address').max(200),
  city: z.string({ error: 'Enter the town or city' }).trim().min(2, 'Enter the town or city').max(80),
  state: z.enum(NIGERIAN_STATES, { error: 'Choose a state' }),
  landmark: optionalText(120).default(null),
  is_default: z.boolean().default(false),
}

export const createAddressBody = z.object(addressFields).transform((v) => ({
  label: v.label,
  recipientName: v.recipient_name,
  phone: v.phone,
  street: v.street,
  city: v.city,
  state: v.state,
  landmark: v.landmark,
  isDefault: v.is_default,
}))

export const updateAddressBody = z
  .object({
    label: addressFields.label.optional(),
    recipient_name: addressFields.recipient_name.optional(),
    phone: requiredPhone.optional(),
    street: addressFields.street.optional(),
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    landmark: addressFields.landmark.optional(),
    is_default: z.boolean().optional(),
    version: versionField,
  })
  .transform((v) => ({
    version: v.version,
    patch: { label: v.label, recipientName: v.recipient_name, phone: v.phone, street: v.street, city: v.city, state: v.state, landmark: v.landmark, isDefault: v.is_default },
  }))

export const updateDeliveryFeeBody = z
  .object({
    fee_kobo: kobo('The delivery fee').max(100_000_000).optional(),
    min_days: z.int().min(1).max(30).optional(),
    max_days: z.int().min(1).max(30).optional(),
    version: versionField,
  })
  .transform((v) => ({ version: v.version, patch: { feeKobo: v.fee_kobo, minDays: v.min_days, maxDays: v.max_days } }))

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const

export const createOrderBody = z
  .object({ address_id: z.int({ error: 'Choose a delivery address' }).min(1).meta({ description: 'One of your saved addresses (GET /addresses).' }) })
  .transform((v) => ({ addressId: v.address_id }))

/** A date in a query string: "2026-10-01" (Lagos midnight) or a full ISO timestamp. */
const queryDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/, 'Use a date like 2026-10-01')
  .transform((v) => new Date(v.length === 10 ? `${v}T00:00:00+01:00` : v))
  .refine((d) => !Number.isNaN(d.getTime()), 'That date doesn’t exist')

export const orderListQuery = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    from: queryDate.optional().meta({ description: 'Staff: orders placed on or after this date (Lagos time).' }),
    to: queryDate.optional().meta({ description: 'Staff: orders placed before the END of this date (Lagos time).' }),
    q: z.string().trim().min(1).max(100).optional().meta({ description: 'Staff: order number, customer name or email.' }),
    ...paginationQuery,
  })
  .transform((v) => ({
    status: v.status,
    from: v.from,
    // "to=2026-10-19" means "up to the end of the 19th".
    to: v.to ? new Date(v.to.getTime() + 24 * 60 * 60 * 1000) : undefined,
    q: v.q,
    cursor: v.cursor,
    limit: v.limit,
  }))

export const transitionBody = z.object({
  to: z.enum(ORDER_STATUSES).meta({ description: 'The status to move to. Only moves in the state machine are accepted.' }),
  note: optionalText(1000).optional(),
  version: versionField,
})

export const noteBody = z.object({ note: text(1000, 'a note') })

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const optionalDate = z.iso
  .datetime({ offset: true, error: 'Use an ISO date-time like 2026-11-01T00:00:00+01:00' })
  .transform((v) => new Date(v))
  .nullable()

const couponCode = z.string().trim().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Use 3–32 letters, numbers, hyphens or underscores').transform((v) => v.toUpperCase())

const couponFields = {
  code: couponCode,
  description: z.string().trim().max(200).default(''),
  kind: z.enum(['percent', 'fixed']),
  value: z.int().min(1).max(MAX_KOBO).meta({ description: 'percent: 1–100. fixed: kobo off the subtotal.' }),
  min_order_kobo: kobo('Minimum subtotal before delivery').default(0),
  max_uses: z.int().min(1).max(1_000_000).nullable().default(null),
  per_customer_limit: z.int().min(1).max(1000).nullable().default(null),
  starts_at: optionalDate.default(null),
  ends_at: optionalDate.default(null),
  active: z.boolean().default(true),
}

const toCouponInput = (v: { code: string; description: string; kind: 'percent' | 'fixed'; value: number; min_order_kobo: number; max_uses: number | null; per_customer_limit: number | null; starts_at: Date | null; ends_at: Date | null; active: boolean }) => ({
  code: v.code,
  description: v.description,
  kind: v.kind,
  value: v.value,
  minOrderKobo: v.min_order_kobo,
  maxUses: v.max_uses,
  perCustomerLimit: v.per_customer_limit,
  startsAt: v.starts_at,
  endsAt: v.ends_at,
  active: v.active,
})

export const createCouponBody = z
  .object(couponFields)
  .refine((v) => v.kind !== 'percent' || v.value <= 100, { path: ['value'], message: 'A percentage is 1 to 100' })
  .refine((v) => !v.starts_at || !v.ends_at || v.ends_at > v.starts_at, { path: ['ends_at'], message: 'The end must be after the start' })
  .transform(toCouponInput)

export const updateCouponBody = z
  .object({
    code: couponCode.optional(),
    description: z.string().trim().max(200).optional(),
    kind: z.enum(['percent', 'fixed']).optional(),
    value: couponFields.value.optional(),
    min_order_kobo: kobo('Minimum subtotal').optional(),
    max_uses: z.int().min(1).max(1_000_000).nullable().optional(),
    per_customer_limit: z.int().min(1).max(1000).nullable().optional(),
    starts_at: optionalDate.optional(),
    ends_at: optionalDate.optional(),
    active: z.boolean().optional(),
    version: versionField,
  })
  .transform((v) => ({
    version: v.version,
    patch: {
      code: v.code,
      description: v.description,
      kind: v.kind,
      value: v.value,
      minOrderKobo: v.min_order_kobo,
      maxUses: v.max_uses,
      perCustomerLimit: v.per_customer_limit,
      startsAt: v.starts_at,
      endsAt: v.ends_at,
      active: v.active,
    },
  }))

export const API_SCOPES = ['catalog:read', 'catalog:write', 'orders:read', 'orders:write'] as const

export const createApiKeyBody = z
  .object({
    name: text(60, 'a name for the key'),
    scopes: z.array(z.enum(API_SCOPES)).min(1, 'Choose at least one scope').max(4),
    expires_at: optionalDate.default(null),
  })
  .refine((v) => !v.expires_at || v.expires_at > new Date(), { path: ['expires_at'], message: 'Choose a date in the future' })
  .transform((v) => ({ name: v.name, scopes: v.scopes, expiresAt: v.expires_at }))

export const userListQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['customer', 'staff', 'admin']).optional(),
  ...paginationQuery,
})

export const updateUserBody = z
  .object({ role: z.enum(['customer', 'staff', 'admin']).optional(), active: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.active !== undefined, { message: 'Send role, active, or both' })

export const createStaffBody = z.object({
  name: text(100, 'their name'),
  email: z.string().trim().max(254).pipe(z.email('Enter an email address like ada@example.com')),
  role: z.enum(['staff', 'admin']),
})

export const listQuery = z.object(paginationQuery)

// ---------------------------------------------------------------------------
// Auth and /me
// ---------------------------------------------------------------------------

export const loginBody = z.object({ email: z.string().trim().max(254).pipe(z.email('Enter your email address')), password: z.string().min(1, 'Enter your password').max(128) })
export const signupBody = z.object({
  name: text(100, 'your name'),
  email: z.string().trim().max(254).pipe(z.email('Enter an email address like ada@example.com')),
  phone: optionalPhone.optional().transform((v) => v ?? null),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
})
export const updateMeBody = z.object({ name: text(100, 'your name'), phone: optionalPhone })
