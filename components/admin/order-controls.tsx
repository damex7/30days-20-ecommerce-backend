'use client'

import { useActionState } from 'react'
import { addNoteAction, moveOrder } from '@/app/(shop)/admin/orders/actions'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SubmitButton } from '@/components/forms/submit-button'
import { TextAreaField } from '@/components/forms/field'
import type { FormState } from '@/lib/validation'

export type Move = { to: string; label: string; destructive: boolean }

/**
 * ONLY THE ALLOWED MOVES are offered (lib/services/order-status.ts decides,
 * for this order and this person). Forward moves are one form with a
 * button per move; refunds and cancellations ask first. Read-only demo
 * accounts see the same buttons, disabled, with the reason.
 */
export function OrderMoves({ orderId, version, moves, readOnly, readOnlyId }: { orderId: number; version: number; moves: Move[]; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(moveOrder, { status: 'idle' } satisfies FormState)
  const forward = moves.filter((m) => !m.destructive)
  const destructive = moves.filter((m) => m.destructive)

  if (moves.length === 0) return <p className="text-muted">No further moves: this order’s journey is complete.</p>

  return (
    <div className="space-y-4">
      {forward.length > 0 ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={orderId} />
          <input type="hidden" name="version" value={version} />
          <TextAreaField id="move-note" name="note" label="Note (optional)" hint="Saved in the history, e.g. the courier’s tracking number." rows={2} maxLength={1000} />
          <div className="flex flex-wrap gap-2">
            {forward.map((m) => (
              <SubmitButton key={m.to} name="to" value={m.to} pendingLabel="Saving…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
                {m.label}
              </SubmitButton>
            ))}
          </div>
        </form>
      ) : null}
      {destructive.map((m) =>
        readOnly ? (
          <button key={m.to} type="button" disabled aria-describedby={readOnlyId} className="inline-flex min-h-11 items-center rounded-control border border-danger px-4 font-semibold text-danger opacity-60">
            {m.label}
          </button>
        ) : (
          <ConfirmAction
            key={m.to}
            action={moveOrder}
            fields={{ id: String(orderId), version: String(version), to: m.to }}
            trigger={m.label}
            triggerVariant="dangerOutline"
            title={`${m.label}?`}
            body={
              <p>
                {m.to === 'refunded'
                  ? 'The order is marked refunded and its items go back on the shelf. No money moves today: refund the customer from the Paystack dashboard.'
                  : 'The order is cancelled and its items go back on the shelf.'}
              </p>
            }
            formExtra={<TextAreaField id={`reason-${m.to}`} name="note" label="Reason (saved in the history)" rows={2} maxLength={1000} />}
            confirmLabel={m.label}
            danger
          />
        ),
      )}
      <p role="status" className={`text-sm font-semibold empty:sr-only ${state.status === 'error' ? 'text-danger' : 'text-success'}`}>
        {state.status !== 'idle' ? state.message : ''}
      </p>
    </div>
  )
}

export function NoteForm({ orderId, readOnly, readOnlyId }: { orderId: number; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(addNoteAction, { status: 'idle' } satisfies FormState<'note'>)
  return (
    <form action={action} noValidate className="space-y-3">
      <ErrorSummary state={state} labels={{ note: 'Note' }} />
      <input type="hidden" name="id" value={orderId} />
      <TextAreaField name="note" label="Add a note" rows={2} maxLength={1000} key={state.status === 'success' ? state.submissionId : 'note'} defaultValue={state.status === 'error' ? state.values?.note : ''} errors={state.fieldErrors?.note} />
      <SubmitButton variant="secondary" pendingLabel="Saving…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Add note
      </SubmitButton>
      <p role="status" className="text-sm font-semibold text-success empty:sr-only">
        {state.status === 'success' ? state.message : ''}
      </p>
    </form>
  )
}
