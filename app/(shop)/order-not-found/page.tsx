// Where proxy.ts sends /account/orders/<id> for an order that doesn't exist
// OR isn't yours, with a real 404 status. The two look the same on purpose.
import type { Metadata } from 'next'
import { NotFoundContent } from '@/components/site/not-found-content'

export const metadata: Metadata = { title: 'Order not found', robots: { index: false } }

export default function OrderNotFound() {
  return <NotFoundContent />
}
