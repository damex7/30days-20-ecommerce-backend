'use client'

import { useActionState, useRef } from 'react'
import { applyCode, changeQuantity, removeCode, removeFromCart } from '@/app/(shop)/cart/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { FieldError, describedBy } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { FormState } from '@/lib/validation'

/** The result of a cart change, read out politely (aria-live) without moving focus. */
function Announce({ state }: { state: FormState }) {
  return (
    <p role="status" className={`text-sm font-semibold empty:sr-only ${state.status === 'error' ? 'text-danger' : 'text-success'}`}>
      {state.status !== 'idle' ? state.message : ''}
    </p>
  )
}

/**
 * Quantity: a <select> that submits as soon as it changes (with an Update
 * button for when JavaScript hasn't loaded yet), and Remove.
 */
export function LineControls({ itemId, name, quantity, max }: { itemId: number; name: string; quantity: number; max: number }) {
  const [qtyState, qtyAction] = useActionState(changeQuantity, { status: 'idle' } satisfies FormState)
  const [removeState, removeAction] = useActionState(removeFromCart, { status: 'idle' } satisfies FormState)
  const formRef = useRef<HTMLFormElement>(null)
  const options = Math.max(quantity, Math.min(Math.max(max, 1), 20))
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <form ref={formRef} action={qtyAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={itemId} />
        <label htmlFor={`qty-${itemId}`} className="text-sm font-semibold">
          Qty<span className="sr-only"> of {name}</span>
        </label>
        <select id={`qty-${itemId}`} name="quantity" defaultValue={quantity} key={quantity} onChange={() => formRef.current?.requestSubmit()} className="field figures min-h-11 w-18 px-2">
          {Array.from({ length: options }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className={button.small}>Update</button>
        </noscript>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="id" value={itemId} />
        <input type="hidden" name="name" value={name} />
        <SubmitButton variant="ghost" pendingLabel="Removing…" className="min-h-11 px-2 text-sm text-danger">
          <Icon name="trash" className="size-4" />
          Remove<span className="sr-only"> {name}</span>
        </SubmitButton>
      </form>
      <div className="basis-full">
        <Announce state={qtyState.status !== 'idle' ? qtyState : removeState} />
      </div>
    </div>
  )
}

/** Apply a code; a refused code shows the exact reason under the field, linked with aria-describedby. */
export function CouponForm() {
  const [state, action] = useActionState(applyCode, { status: 'idle' } satisfies FormState<'code'>)
  const errors = state.fieldErrors?.code
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ code: 'Coupon code' }} />
      <label htmlFor="code" className="mb-1 block font-semibold">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id="code"
          name="code"
          defaultValue={state.values?.code}
          key={state.submissionId}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy('code', false, Boolean(errors?.length))}
          className="field min-h-11 w-full min-w-0 px-3 font-mono uppercase"
        />
        <SubmitButton variant="secondary" pendingLabel="Checking…">
          Apply
        </SubmitButton>
      </div>
      <FieldError name="code" errors={errors} />
      {state.status === 'success' ? <Announce state={state} /> : null}
    </form>
  )
}

export function RemoveCouponButton({ code }: { code: string }) {
  const [state, action] = useActionState(removeCode, { status: 'idle' } satisfies FormState)
  return (
    <form action={action} className="inline">
      <SubmitButton variant="ghost" pendingLabel="Removing…" className="min-h-9 px-2 text-sm">
        Remove<span className="sr-only"> code {code}</span>
      </SubmitButton>
      <Announce state={state} />
    </form>
  )
}
