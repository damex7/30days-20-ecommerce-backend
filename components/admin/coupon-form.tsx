'use client'

import { useActionState } from 'react'
import { createCouponAction, type CouponField } from '@/app/(shop)/admin/coupons/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { NairaField, SelectField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

const LABELS: Record<CouponField, string> = {
  code: 'Code',
  description: 'Description',
  kind: 'Type',
  value: 'Value',
  min_order: 'Minimum order',
  min_order_kobo: 'Minimum order',
  max_uses: 'Maximum uses',
  per_customer_limit: 'Uses per customer',
  starts_on: 'Starts',
  starts_at: 'Starts',
  ends_on: 'Ends',
  ends_at: 'Ends',
}

export function CouponForm({ readOnly, readOnlyId }: { readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(createCouponAction, { status: 'idle' } satisfies FormState<CouponField>)
  const v = (k: CouponField) => state.values?.[k] ?? ''
  const e = (...keys: CouponField[]) => keys.map((k) => state.fieldErrors?.[k]).find(Boolean)
  return (
    <form action={action} noValidate className="space-y-4" key={state.status === 'success' ? state.submissionId : 'coupon'}>
      <ErrorSummary state={state} labels={LABELS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="code" label="Code" hint="Letters, numbers, - and _. Customers can type it in any case." defaultValue={v('code')} errors={e('code')} className="[&_input]:font-mono [&_input]:uppercase" />
        <TextField name="description" label="Description (optional)" defaultValue={v('description')} errors={e('description')} />
        <SelectField name="kind" label="Type" defaultValue={v('kind') || 'percent'} errors={e('kind')}>
          <option value="percent">Percentage off</option>
          <option value="fixed">Fixed amount off (₦)</option>
        </SelectField>
        <TextField name="value" label="Value" hint="Percentage: 1–100. Fixed: Naira, e.g. 5000." inputMode="decimal" defaultValue={v('value')} errors={e('value')} />
        <NairaField name="min_order" label="Minimum order (optional)" hint="Subtotal before delivery" defaultValue={v('min_order')} errors={e('min_order', 'min_order_kobo')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="max_uses" label="Max uses" inputMode="numeric" hint="Empty = no limit" defaultValue={v('max_uses')} errors={e('max_uses')} />
          <TextField name="per_customer_limit" label="Per customer" inputMode="numeric" hint="Empty = no limit" defaultValue={v('per_customer_limit')} errors={e('per_customer_limit')} />
        </div>
        <TextField name="starts_on" label="Starts (optional)" type="date" defaultValue={v('starts_on')} errors={e('starts_on', 'starts_at')} />
        <TextField name="ends_on" label="Ends (optional)" type="date" hint="The code works until the end of this day, Lagos time." defaultValue={v('ends_on')} errors={e('ends_on', 'ends_at')} />
      </div>
      <SubmitButton pendingLabel="Creating…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Create coupon
      </SubmitButton>
      <p role="status" className="text-sm font-semibold text-success empty:sr-only">
        {state.status === 'success' ? state.message : ''}
      </p>
    </form>
  )
}
