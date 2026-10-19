// THE STOREFRONT'S URL: filters, search and sort live in the query string,
// so a filtered page can be bookmarked, shared on WhatsApp and reloaded.
//
//   /products?category=shoes&size=42&colour=Tan&max=50000&in_stock=1&sort=price_asc
//
// Prices here are in whole NAIRA (people type "50000", not "5000000"); this
// converts them to kobo for the service. Every field has .catch(): a
// mangled URL falls back to "no filter" instead of an error page. (The API
// is strict instead and answers 422, because a program should hear about
// its mistakes.)
import { z } from 'zod'
import { PRODUCT_SORTS } from '@/lib/api/requests'

const text = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined)
const naira = z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined)

export const shopQuerySchema = z.object({
  category: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
  q: text(100),
  size: text(20),
  colour: text(30),
  min: naira,
  max: naira,
  in_stock: z.literal('1').optional().catch(undefined),
  sort: z.enum(PRODUCT_SORTS).catch('newest'),
  cursor: z.string().max(600).optional().catch(undefined),
})
export type ShopQuery = z.infer<typeof shopQuerySchema>

/** Next.js searchParams → the first value of each key. */
export function firstValues(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v !== undefined && v !== '') out[key] = v
  }
  return out
}

/** The same query with some keys changed (or removed with undefined), as a URL. Always drops the cursor. */
export function shopHref(query: ShopQuery, change: Partial<Record<keyof ShopQuery, string | undefined>>): string {
  const params = new URLSearchParams()
  const merged = { ...query, cursor: undefined, ...change }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue
    if (key === 'sort' && value === 'newest') continue
    params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `/products?${s}` : '/products'
}
