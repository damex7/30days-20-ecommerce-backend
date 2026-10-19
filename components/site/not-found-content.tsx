import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { button } from '@/components/ui/button'

/** The body of every 404: unknown URLs, and an order that doesn't exist or isn't yours (the two look the same on purpose). */
export function NotFoundContent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Mark className="mb-5 size-16 text-brand" />
      <p className="stamp text-muted">404 · Not found</p>
      <h1 className="mt-1 text-4xl">We couldn’t find that</h1>
      <p className="mt-3 max-w-sm text-muted">There’s nothing at this address that you can see. The link may be mistyped, or it points to an order on another account.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/products" className={button.primary}>
          Browse the shop
        </Link>
        <Link href="/account" className={button.secondary}>
          Your orders
        </Link>
      </div>
    </div>
  )
}
