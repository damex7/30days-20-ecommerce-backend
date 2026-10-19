import Link from 'next/link'
import type { ProductSummaryRow } from '@/lib/repos/products'
import { Price, StockNote } from './price'

/** One product in the grid: picture, name, category, price, stock. The whole card is one link. */
export function ProductCard({ product }: { product: ProductSummaryRow }) {
  return (
    <article className="stitched group relative flex flex-col overflow-hidden rounded-card border border-line bg-raised shadow-card transition-transform hover:-translate-y-0.5">
      <div className="aspect-[5/4] overflow-hidden bg-sunken">
        {product.imageUrl ? (
          // Local SVG drawings: next/image adds nothing for them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.imageAlt ?? ''} width={500} height={420} className="size-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pb-5">
        <p className="stamp text-muted">{product.categoryName}</p>
        <h3 className="text-xl leading-tight">
          {/* The ::after makes the whole card clickable while only the name is the link text. */}
          <Link href={`/products/${product.slug}`} className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2">
          {product.priceFromKobo !== null ? <Price kobo={product.priceFromKobo} compareAt={product.compareAtFromKobo} from /> : null}
          <StockNote stock={product.stockTotal} />
        </div>
      </div>
    </article>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading products" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-line bg-raised">
          <div className="skeleton aspect-[5/4] rounded-none" />
          <div className="space-y-2 p-4">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-5 w-3/4" />
            <div className="skeleton h-5 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
