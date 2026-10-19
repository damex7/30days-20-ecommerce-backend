import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { STATUS_STYLE, StatusBadge } from '@/components/shop/status-badge'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatShort } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { ORDER_STATUSES, orderListQuery } from '@/lib/api/requests'
import { isServiceError } from '@/lib/services/errors'
import { listOrders } from '@/lib/services/orders'
import { requireShopActor } from '@/lib/services/session-actor'
import { firstValues } from '@/lib/shop-query'

export const metadata: Metadata = { title: 'Orders' }

export default function AdminOrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  return (
    <>
      <PageHeader title="Orders" description="Newest first. Filters live in the address bar, so a filtered list can be bookmarked or shared." />
      <Suspense fallback={<TableSkeleton />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Orders({ searchParams }: Pick<PageProps<'/admin/orders'>, 'searchParams'>) {
  const actor = await requireShopActor()
  const raw = firstValues(await searchParams)
  // The API's own query schema, so the page and GET /api/v1/orders agree.
  const parsed = orderListQuery.safeParse({ ...raw, limit: '20' })
  const query = parsed.success ? parsed.data : orderListQuery.parse({ limit: '20' })

  let page
  let reset = !parsed.success
  try {
    page = await listOrders(actor, query)
  } catch (error) {
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    reset = true
    page = await listOrders(actor, { ...query, cursor: undefined })
  }
  const keep = new URLSearchParams(Object.entries(raw).filter(([k]) => k !== 'cursor'))
  const nextHref = page.nextCursor ? `/admin/orders?${new URLSearchParams([...keep, ['cursor', page.nextCursor]])}` : null

  return (
    <div className="space-y-5">
      <form method="get" action="/admin/orders" className="grid gap-3 rounded-card border border-line bg-raised p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-semibold">
            Status
          </label>
          <select id="status" name="status" defaultValue={raw.status ?? ''} className="field min-h-11 w-full px-2">
            <option value="">Any status</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_STYLE[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="mb-1 block text-sm font-semibold">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={raw.from} className="field min-h-11 w-full px-2" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-sm font-semibold">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={raw.to} className="field min-h-11 w-full px-2" />
        </div>
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={raw.q} placeholder="OJA-2026-…, name or email" className="field min-h-11 w-full px-3" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={button.primary}>
            <Icon name="filter" />
            Filter
          </button>
          <Link href="/admin/orders" className={button.ghost}>
            Clear
          </Link>
        </div>
      </form>

      {reset ? (
        <Notice tone="info" title="Some filters couldn’t be used">
          <p>A date or page link wasn’t valid, so it was left out.</p>
        </Notice>
      ) : null}

      {page.items.length === 0 ? (
        <EmptyState title="No orders match">Try another status or a wider date range.</EmptyState>
      ) : (
        <>
          {/* Wide screens: a table. */}
          <div className="overflow-x-auto rounded-card border border-line bg-raised shadow-card max-md:hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Orders, newest first</caption>
              <thead className="border-b border-line bg-sunken">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Order</th>
                  <th scope="col" className="px-3 py-2.5">Placed</th>
                  <th scope="col" className="px-3 py-2.5">Customer</th>
                  <th scope="col" className="px-3 py-2.5">Ship to</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Total</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-line">
                {page.items.map((o) => (
                  <tr key={o.id} className="hover:bg-tint">
                    <th scope="row" className="px-3 py-2.5 font-normal">
                      <Link href={`/admin/orders/${o.id}`} className="font-mono font-bold">
                        {o.number}
                      </Link>
                      {o.isDemo ? <span className="stamp ml-2 text-[0.6rem] text-muted">Demo</span> : null}
                    </th>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatShort(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.customerName}
                      <span className="block text-xs text-muted">{o.customerEmail}</span>
                    </td>
                    <td className="px-3 py-2.5">{o.shipState}</td>
                    <td className="figures px-3 py-2.5 text-right font-semibold">{formatNaira(o.totalKobo)}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="space-y-3 md:hidden">
            {page.items.map((o) => (
              <li key={o.id} className="rounded-card border border-line bg-raised p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-bold">
                    {o.number}
                  </Link>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 text-sm">
                  {o.customerName} · {o.shipState}
                </p>
                <p className="text-sm text-muted">
                  {formatShort(o.createdAt)} · <span className="figures font-semibold text-ink">{formatNaira(o.totalKobo)}</span>
                  {o.isDemo ? ' · demo' : ''}
                </p>
              </li>
            ))}
          </ul>
          <nav aria-label="Pages" className="flex flex-wrap gap-2">
            {raw.cursor ? (
              <Link href={`/admin/orders${keep.size ? `?${keep}` : ''}`} className={button.secondary}>
                Back to the newest
              </Link>
            ) : null}
            {nextHref ? (
              <Link href={nextHref} className={button.primary}>
                Older orders
                <Icon name="arrowRight" />
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  )
}
