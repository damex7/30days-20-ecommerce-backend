import { formatNaira } from '@/lib/money'
import { cn } from '@/lib/cn'

/**
 * A price in Naira from integer kobo (Intl.NumberFormat, no floats). On
 * sale, the old price is struck through, and screen readers hear "was
 * ₦45,000.00, now ₦38,000.00" rather than two numbers in a row.
 */
export function Price({ kobo, compareAt, from = false, className }: { kobo: number; compareAt?: number | null; from?: boolean; className?: string }) {
  const onSale = compareAt !== null && compareAt !== undefined && compareAt > kobo
  return (
    <span className={cn('figures inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {onSale ? (
        <>
          <span className="sr-only">Was {formatNaira(compareAt)}, now</span>
          <del aria-hidden className="text-[0.85em] font-normal text-muted">
            {formatNaira(compareAt)}
          </del>
        </>
      ) : null}
      <span className="font-bold">
        {from ? <span className="text-[0.8em] font-semibold text-muted">from </span> : null}
        {formatNaira(kobo)}
      </span>
      {onSale ? <span className="stamp rounded-control bg-brand px-1.5 py-0.5 text-[0.6rem] text-on-brand">Sale</span> : null}
    </span>
  )
}

/** "Only 2 left" when stock is low, "Sold out" at zero, nothing when there's plenty. */
export function StockNote({ stock, className }: { stock: number; className?: string }) {
  if (stock <= 0) return <span className={cn('text-sm font-semibold text-danger', className)}>Sold out</span>
  if (stock <= 3) return <span className={cn('text-sm font-semibold text-khaki', className)}>Only {stock} left</span>
  return null
}
