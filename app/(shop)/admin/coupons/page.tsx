import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CouponForm } from '@/components/admin/coupon-form'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { ActionButton } from '@/components/forms/action-button'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { formatDate } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { couponState, listCoupons } from '@/lib/services/coupons'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireAdminActor } from '@/lib/services/session-actor'
import { toggleCoupon } from './actions'

export const metadata: Metadata = { title: 'Coupons' }

const STATE_STYLE = {
  active: 'border-success bg-success-soft text-success',
  scheduled: 'border-cobalt bg-cobalt-soft text-cobalt',
  expired: 'border-ash bg-ash-soft text-ash',
  used_up: 'border-danger bg-danger-soft text-danger',
  paused: 'border-khaki bg-khaki-soft text-khaki',
} as const

export default function CouponsPage() {
  return (
    <>
      <PageHeader title="Coupons" description="Codes customers type at checkout. Each refusal tells the customer why: expired, used up, or minimum not met." />
      <Suspense fallback={<TableSkeleton />}>
        <Coupons />
      </Suspense>
    </>
  )
}

async function Coupons() {
  const actor = await requireAdminActor()
  const page = await listCoupons(actor, { limit: 100 })
  const readOnly = isReadOnlyDemo(actor)
  return (
    <div className="space-y-6">
      <ReadOnlyNote show={readOnly} />
      <ul className="grid gap-3 md:grid-cols-2">
        {page.items.map((c) => {
          const state = couponState(c)
          return (
            <li key={c.id} className="rounded-card border border-line bg-raised p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold">{c.code}</span>
                <span className={`rounded-pill border px-2.5 py-0.5 text-sm font-bold ${STATE_STYLE[state]}`}>{state.replace('_', ' ')}</span>
              </div>
              <p className="mt-1 text-sm">{c.description}</p>
              <dl className="figures mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Gives</dt>
                <dd>{c.kind === 'percent' ? `${c.value}% off` : `${formatNaira(c.value)} off`}</dd>
                <dt className="text-muted">Minimum</dt>
                <dd>{c.minOrderKobo > 0 ? formatNaira(c.minOrderKobo) : 'None'}</dd>
                <dt className="text-muted">Used</dt>
                <dd>
                  {c.uses}
                  {c.maxUses !== null ? ` of ${c.maxUses}` : ''}
                  {c.perCustomerLimit !== null ? ` · ${c.perCustomerLimit} per customer` : ''}
                </dd>
                <dt className="text-muted">Window</dt>
                <dd>
                  {c.startsAt ? formatDate(c.startsAt) : 'Now'} – {c.endsAt ? formatDate(c.endsAt) : 'no end'}
                </dd>
              </dl>
              {!readOnly ? (
                <ActionButton action={toggleCoupon} fields={{ id: String(c.id), version: String(c.version), active: String(!c.active) }} className="mt-3" pendingLabel="Saving…">
                  {c.active ? 'Pause' : 'Resume'}
                  <span className="sr-only"> {c.code}</span>
                </ActionButton>
              ) : null}
            </li>
          )
        })}
      </ul>
      <section aria-labelledby="new-coupon" className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="new-coupon" className="mb-4 text-2xl">
          New coupon
        </h2>
        <CouponForm readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
      </section>
    </div>
  )
}
