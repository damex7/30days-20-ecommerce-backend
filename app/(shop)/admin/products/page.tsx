import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { StockNote } from '@/components/shop/price'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { PRODUCT_STATUSES } from '@/lib/api/requests'
import { isServiceError } from '@/lib/services/errors'
import { listProducts } from '@/lib/services/catalog'
import { requireShopActor } from '@/lib/services/session-actor'
import { firstValues } from '@/lib/shop-query'

export const metadata: Metadata = { title: 'Products' }

export default function AdminProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Link href="/admin/products/new" className={button.primary}>
            <Icon name="plus" />
            New product
          </Link>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <Products searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Products({ searchParams }: Pick<PageProps<'/admin/products'>, 'searchParams'>) {
  const actor = await requireShopActor()
  const raw = firstValues(await searchParams)
  const status = (PRODUCT_STATUSES as readonly string[]).includes(raw.status ?? '') ? (raw.status as (typeof PRODUCT_STATUSES)[number]) : 'active'
  const q = raw.q?.slice(0, 100)
  let page
  try {
    page = await listProducts(actor, { status, q, sort: 'newest', cursor: raw.cursor, limit: 25 })
  } catch (error) {
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    page = await listProducts(actor, { status, q, sort: 'newest', limit: 25 })
  }
  const keep = new URLSearchParams(Object.entries({ status, ...(q ? { q } : {}) }))

  return (
    <div className="space-y-5">
      {raw.notice === 'deleted' ? (
        <Notice tone="success" title="Product deleted" live>
          <p>It had never been ordered, so it was removed completely.</p>
        </Notice>
      ) : null}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-raised p-4 shadow-card">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-semibold">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field min-h-11 px-2">
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={q} className="field min-h-11 w-full px-3" />
        </div>
        <button type="submit" className={button.secondary}>
          Show
        </button>
      </form>
      {page.items.length === 0 ? (
        <EmptyState title={`No ${status} products`}>{status === 'active' ? <Link href="/admin/products/new">Create one</Link> : null}</EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-line rounded-card border border-line bg-raised shadow-card">
          {page.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 p-3">
              <div className="size-14 shrink-0 overflow-hidden rounded-control border border-line bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" width={56} height={47} className="size-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/products/${p.id}`} className="font-semibold text-ink">
                  {p.name}
                </Link>
                <p className="text-sm text-muted">
                  {p.categoryName} · <span className="font-mono">/{p.slug}</span>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="figures font-semibold">{p.priceFromKobo !== null ? `from ${formatNaira(p.priceFromKobo)}` : 'No price yet'}</p>
                <p className="figures text-muted">
                  {p.stockTotal} in stock <StockNote stock={p.stockTotal} className="ml-1" />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pages" className="flex gap-2">
        {raw.cursor ? (
          <Link href={`/admin/products?${keep}`} className={button.secondary}>
            Back to the start
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={`/admin/products?${new URLSearchParams([...keep, ['cursor', page.nextCursor]])}`} className={button.primary}>
            Next page
          </Link>
        ) : null}
      </nav>
    </div>
  )
}
