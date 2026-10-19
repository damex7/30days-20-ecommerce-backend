'use client'

import { useActionState } from 'react'
import { placeOrder } from '@/app/(shop)/checkout/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SubmitButton } from '@/components/forms/submit-button'
import { Icon } from '@/components/ui/icon'
import type { FormState } from '@/lib/validation'

/**
 * "Place order". The idempotency key comes from the SERVER, made when the
 * page rendered: every submit of THIS page carries the same key, so a
 * double tap or a retry can only ever make one order. A new visit to
 * /checkout gets a new key (a new order is then intended).
 */
export function PlaceOrderForm({ idempotencyKey, addressId, label, disabledReason }: { idempotencyKey: string; addressId: number | null; label: string; disabledReason: string | null }) {
  const [state, action] = useActionState(placeOrder, { status: 'idle' } satisfies FormState<'address_id'>)
  return (
    <form action={action}>
      <ErrorSummary state={state} labels={{ address_id: 'Delivery address' }} />
      <input type="hidden" name="key" value={idempotencyKey} />
      <input type="hidden" name="address_id" value={addressId ?? ''} />
      <SubmitButton variant="large" className="w-full" pendingLabel="Placing your order…" disabled={disabledReason !== null} describedBy={disabledReason ? 'place-order-why' : undefined}>
        <Icon name="lock" />
        {label}
      </SubmitButton>
      {disabledReason ? (
        <p id="place-order-why" className="mt-2 text-sm text-muted">
          {disabledReason}
        </p>
      ) : null}
    </form>
  )
}
