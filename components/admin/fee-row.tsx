'use client'

import { useActionState } from 'react'
import { saveFee } from '@/app/(shop)/admin/delivery-fees/actions'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

/** One state's fee and delivery time, as a compact form. Labels are visible on phones and screen readers. */
export function FeeRow({ state, fee, minDays, maxDays, version, readOnly, readOnlyId }: { state: string; fee: string; minDays: number; maxDays: number; version: number; readOnly: boolean; readOnlyId: string }) {
  const [result, action] = useActionState(saveFee, { status: 'idle' } satisfies FormState)
  const id = state.replace(/\s+/g, '-').toLowerCase()
  return (
    <form action={action} className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-2 py-3 sm:grid-cols-[10rem_9rem_5rem_5rem_auto_1fr]">
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="version" value={version} />
      <p className="col-span-2 font-semibold sm:col-span-1 sm:self-center">{state}</p>
      <label className="block text-sm">
        <span className="text-muted sm:sr-only">Fee (₦)</span>
        <span className="relative block">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted">
            ₦
          </span>
          <input id={`fee-${id}`} name="fee" defaultValue={fee} inputMode="decimal" aria-label={`Fee for ${state} in Naira`} className="field figures min-h-10 w-full pr-2 pl-6" />
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-muted sm:sr-only">Min days</span>
        <input name="min_days" defaultValue={minDays} inputMode="numeric" aria-label={`Fewest days to ${state}`} className="field figures min-h-10 w-full px-2" />
      </label>
      <label className="block text-sm">
        <span className="text-muted sm:sr-only">Max days</span>
        <input name="max_days" defaultValue={maxDays} inputMode="numeric" aria-label={`Most days to ${state}`} className="field figures min-h-10 w-full px-2" />
      </label>
      <SubmitButton variant="small" pendingLabel="…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Save<span className="sr-only"> {state}</span>
      </SubmitButton>
      <p role="status" className={`col-span-full text-sm font-semibold empty:sr-only sm:col-span-1 ${result.status === 'error' ? 'text-danger' : 'text-success'}`}>
        {result.status !== 'idle' ? result.message : ''}
      </p>
    </form>
  )
}
