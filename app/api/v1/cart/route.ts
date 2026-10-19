// GET /api/v1/cart
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { cartJson } from '@/lib/api/responses'
import { getCart } from '@/lib/services/cart'

export const GET = handle(endpoints.getCart, async ({ actor, query }) => ok(cartJson(await getCart(actor, query))))
