import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { button } from '@/components/ui/button'

export default function ProductNotFound() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <Mark className="mb-5 size-16 text-brand" />
      <p className="stamp text-muted">404 · Not found</p>
      <h1 className="mt-1 text-4xl">That piece isn’t in the workshop</h1>
      <p className="mt-3 max-w-sm text-muted">It may have sold out for good and been archived, or the link is mistyped.</p>
      <Link href="/products" className={`${button.primary} mt-6`}>
        Browse everything
      </Link>
    </div>
  )
}
