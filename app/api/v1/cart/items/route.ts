// POST /api/v1/cart/items
import { endpoints } from '@/lib/api/endpoints'
import { created, handle } from '@/lib/api/handler'
import { cartJson } from '@/lib/api/responses'
import { addItem } from '@/lib/services/cart'

export const POST = handle(endpoints.addCartItem, async ({ actor, body }) => created(cartJson(await addItem(actor, body)), '/api/v1/cart'))
