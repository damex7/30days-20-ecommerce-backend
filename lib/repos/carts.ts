// CARTS: SQL only. Ownership is in the SQL: every item query joins through
// carts.customer_id, so an item id from someone else's cart matches nothing.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from '@/lib/rows'

export const CartLineRow = z.object({
  itemId: int8,
  variantId: int8,
  quantity: z.number().int(),
  productId: int8,
  productSlug: z.string(),
  productName: z.string(),
  productStatus: z.enum(['draft', 'active', 'archived']),
  sku: z.string(),
  size: z.string(),
  colour: z.string(),
  // LIVE price and stock, read now, never stored in the cart.
  priceKobo: int8,
  compareAtPriceKobo: int8.nullable(),
  stock: z.number().int(),
  variantStatus: z.enum(['active', 'archived']),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
})
export type CartLineRow = z.infer<typeof CartLineRow>

export const CartRow = z.object({ id: int8, couponId: int8.nullable(), updatedAt: z.date() })
export type CartRow = z.infer<typeof CartRow>

/** The customer's cart, created on first use. ON CONFLICT makes two tabs racing still end with one cart. */
export async function ensureCart(db: Db, customerId: string): Promise<CartRow> {
  const result = await rows(
    db,
    CartRow,
    q`WITH ins AS (
        INSERT INTO carts (customer_id) VALUES (${customerId})
        ON CONFLICT (customer_id) DO NOTHING
        RETURNING id, coupon_id, updated_at
      )
      SELECT id, coupon_id AS "couponId", updated_at AS "updatedAt" FROM ins
      UNION ALL
      SELECT id, coupon_id, updated_at FROM carts WHERE customer_id = ${customerId}
      LIMIT 1`,
    'ensureCart',
  )
  if (result[0]) return result[0]
  // The rare race: another request inserted the cart after this statement's
  // snapshot was taken, so neither branch saw it. A fresh read does.
  const existing = await findCart(db, customerId)
  if (!existing) throw new Error('ensureCart: the cart vanished')
  return existing
}

export function findCart(db: Db, customerId: string): Promise<CartRow | null> {
  return one(db, CartRow, q`SELECT id, coupon_id AS "couponId", updated_at AS "updatedAt" FROM carts WHERE customer_id = ${customerId}`, 'findCart')
}

/**
 * LOCKS the customer's cart row until the transaction ends (SELECT ... FOR
 * UPDATE). Checkout takes this first, so two checkouts by the same customer
 * (two tabs, a double tap with two different idempotency keys) run one
 * after the other: the second finds the cart already emptied.
 */
export function lockCart(tx: Db, customerId: string): Promise<CartRow | null> {
  return one(tx, CartRow, q`SELECT id, coupon_id AS "couponId", updated_at AS "updatedAt" FROM carts WHERE customer_id = ${customerId} FOR UPDATE`, 'lockCart')
}

export function listCartLines(db: Db, cartId: number): Promise<CartLineRow[]> {
  return rows(
    db,
    CartLineRow,
    q`SELECT ci.id AS "itemId", ci.variant_id AS "variantId", ci.quantity,
             p.id AS "productId", p.slug AS "productSlug", p.name AS "productName", p.status AS "productStatus",
             v.sku, v.size, v.colour, v.price_kobo AS "priceKobo", v.compare_at_price_kobo AS "compareAtPriceKobo",
             v.stock, v.status AS "variantStatus", img.url AS "imageUrl", img.alt AS "imageAlt"
      FROM cart_items ci
      JOIN product_variants v ON v.id = ci.variant_id
      JOIN products p ON p.id = v.product_id
      LEFT JOIN LATERAL (
        SELECT i.url, i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1
      ) img ON true
      WHERE ci.cart_id = ${cartId}
      ORDER BY ci.created_at, ci.id`,
    'listCartLines',
  )
}

/** Adds a variant, or increases its quantity if it's already there (capped at 20). */
export async function addCartItem(db: Db, cartId: number, variantId: number, quantity: number): Promise<{ id: number; quantity: number }> {
  const result = await rows(
    db,
    z.object({ id: int8, quantity: z.number().int() }),
    q`WITH item AS (
        INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (${cartId}, ${variantId}, ${quantity})
        ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 20)
        RETURNING id, quantity
      ), touch AS (UPDATE carts SET updated_at = now() WHERE id = ${cartId})
      SELECT id, quantity FROM item`,
    'addCartItem',
  )
  return result[0]!
}

/** Ownership: the item must be in THIS customer's cart. null = not found. */
export async function findCartItem(db: Db, customerId: string, itemId: number): Promise<{ id: number; variantId: number; quantity: number } | null> {
  return one(
    db,
    z.object({ id: int8, variantId: int8, quantity: z.number().int() }),
    q`SELECT ci.id, ci.variant_id AS "variantId", ci.quantity FROM cart_items ci
      JOIN carts c ON c.id = ci.cart_id
      WHERE ci.id = ${itemId} AND c.customer_id = ${customerId}`,
    'findCartItem',
  )
}

export async function setCartItemQuantity(db: Db, customerId: string, itemId: number, quantity: number): Promise<boolean> {
  const result = await db.query(q`
    UPDATE cart_items ci SET quantity = ${quantity}
    FROM carts c
    WHERE ci.id = ${itemId} AND c.id = ci.cart_id AND c.customer_id = ${customerId}
    RETURNING ci.id`)
  return result.length > 0
}

export async function removeCartItem(db: Db, customerId: string, itemId: number): Promise<boolean> {
  const result = await db.query(q`
    DELETE FROM cart_items ci USING carts c
    WHERE ci.id = ${itemId} AND c.id = ci.cart_id AND c.customer_id = ${customerId}
    RETURNING ci.id`)
  return result.length > 0
}

export async function setCartCoupon(db: Db, cartId: number, couponId: number | null): Promise<void> {
  await db.query(q`UPDATE carts SET coupon_id = ${couponId} WHERE id = ${cartId}`)
}

/** After checkout: the items became an order, and the coupon went with them. */
export async function clearCart(tx: Db, cartId: number): Promise<void> {
  await tx.query(q`DELETE FROM cart_items WHERE cart_id = ${cartId}`)
  await tx.query(q`UPDATE carts SET coupon_id = NULL WHERE id = ${cartId}`)
}
