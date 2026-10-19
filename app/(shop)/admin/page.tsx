import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { StatusBadge } from '@/components/shop/status-badge'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Icon } from '@/components/ui/icon'
import { formatShort } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { getDashboard } from '@/lib/services/dashboard'
import { listOrders } from '@/lib/services/orders'
import { requireShopActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Workshop' }

export default function AdminHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  const actor = await requireShopActor()
  const [{ summary, low }, recent] = await Promise.all([getDashboard(actor), listOrders(actor, { limit: 6 })])
  const tiles = [
    { label: 'Paid orders, 30 days', value: String(summary.paidOrders), icon: 'receipt' as const },
    { label: 'Takings, 30 days', value: formatNaira(summary.revenueKobo), icon: 'tag' as const },
    { label: 'To pack and ship', value: String(summary.toShip), icon: 'package' as const, href: '/admin/orders?status=paid' },
    { label: 'Awaiting payment', value: String(summary.awaitingPayment), icon: 'clock' as const, href: '/admin/orders?status=pending_payment' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl">Good day, {actor.user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-muted">
          Real sales only: {summary.demoOrders} demo {summary.demoOrders === 1 ? 'order' : 'orders'} from the last 30 days are left out of these figures.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label} className="stitched rounded-card border border-line bg-raised p-5 shadow-card">
            <p className="stamp flex items-center gap-1.5 text-muted">
              <Icon name={t.icon} className="size-4" />
              {t.label}
            </p>
            <p className="figures mt-2 font-display text-3xl font-bold">{t.href ? <Link href={t.href} className="text-ink">{t.value}</Link> : t.value}</p>
          </li>
        ))}
      </ul>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-title" className="text-2xl">
              Latest orders
            </h2>
            <Link href="/admin/orders" className="link text-sm">
              All orders
            </Link>
          </div>
          <ul className="divide-y divide-dashed divide-line">
            {recent.items.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-bold">
                    {o.number}
                  </Link>
                  <span className="block text-sm text-muted">
                    {o.customerName} · {formatShort(o.createdAt)} · <span className="figures">{formatNaira(o.totalKobo)}</span>
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="low-title" className="rounded-card border border-line bg-raised p-5 shadow-card">
          <h2 id="low-title" className="mb-3 text-2xl">
            Running low
          </h2>
          {low.length === 0 ? (
            <p className="text-muted">Everything has at least 3 on the shelf.</p>
          ) : (
            <ul className="divide-y divide-dashed divide-line">
              {low.map((v) => (
                <li key={v.variantId} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <Link href={`/admin/products/${v.productId}`} className="font-semibold text-ink">
                      {v.productName}
                    </Link>
                    <span className="block text-sm text-muted">
                      {v.size} / {v.colour} · <span className="font-mono">{v.sku}</span>
                    </span>
                  </span>
                  <span className={`figures font-bold ${v.stock === 0 ? 'text-danger' : 'text-khaki'}`}>{v.stock === 0 ? 'Sold out' : `${v.stock} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
