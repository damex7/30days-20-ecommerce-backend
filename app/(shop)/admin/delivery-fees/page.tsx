import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FeeRow } from '@/components/admin/fee-row'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { koboToInput } from '@/lib/money'
import { listDeliveryFees } from '@/lib/services/addresses'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireAdminActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Delivery fees' }

export default function DeliveryFeesPage() {
  return (
    <>
      <PageHeader title="Delivery fees" description="One row per state and the FCT. Checkout adds the fee for the customer’s address; past orders keep the fee they paid." />
      <Suspense fallback={<TableSkeleton rows={12} />}>
        <Fees />
      </Suspense>
    </>
  )
}

async function Fees() {
  const actor = await requireAdminActor()
  const fees = await listDeliveryFees()
  const readOnly = isReadOnlyDemo(actor)
  return (
    <section className="rounded-card border border-line bg-raised px-4 shadow-card sm:px-6">
      <ReadOnlyNote show={readOnly} />
      <div aria-hidden className="hidden grid-cols-[10rem_9rem_5rem_5rem_auto_1fr] gap-x-3 border-b border-line py-2 text-sm font-semibold text-muted sm:grid">
        <span>State</span>
        <span>Fee</span>
        <span>Min days</span>
        <span>Max days</span>
      </div>
      <div className="divide-y divide-dashed divide-line">
        {fees.map((f) => (
          <FeeRow key={f.state} state={f.state} fee={koboToInput(f.feeKobo)} minDays={f.minDays} maxDays={f.maxDays} version={f.version} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
        ))}
      </div>
    </section>
  )
}
