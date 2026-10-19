// ADD TO CART, from the product page. The same service as POST
// /api/v1/cart/items, so the stock check and the 20-per-item cap are identical.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fromServiceError, fromZodError } from '@/lib/action-helpers'
import { addCartItemBody } from '@/lib/api/requests'
import { addItem } from '@/lib/services/cart'
import { getPageActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

export async function addToCart(_previous: FormState, formData: FormData): Promise<FormState> {
  const slug = field(formData, 'slug').replace(/[^a-z0-9-]/g, '')
  const actor = await getPageActor()
  // Signed out: sign in first, then come straight back to this product.
  if (actor.kind === 'anonymous') redirect(`/login?next=${encodeURIComponent(`/products/${slug}`)}`)
  if (actor.kind === 'user' && actor.user.role !== 'customer') {
    return { status: 'error', message: 'Staff and admin accounts don’t have a cart. Sign in as a customer to buy.', submissionId: Date.now() }
  }

  const parsed = addCartItemBody.safeParse({ variant_id: Number(field(formData, 'variant_id')) || undefined, quantity: Number(field(formData, 'quantity')) || 1 })
  if (!parsed.success) return fromZodError(parsed.error)
  try {
    const cart = await addItem(actor, parsed.data)
    const line = cart.lines.find((l) => l.variantId === parsed.data.variantId)
    // Re-render the page (and the header's cart count) with fresh data.
    refresh()
    return {
      status: 'success',
      message: line ? `Added to your cart: ${line.productName}, size ${line.size} in ${line.colour.toLowerCase()} (${line.quantity} in cart).` : 'Added to your cart.',
      submissionId: Date.now(),
    }
  } catch (error) {
    return fromServiceError(error)
  }
}
