'use client'

import { useActionState } from 'react'
import { saveAddress, type AddressField } from '@/app/(shop)/account/address-actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SelectField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { NIGERIAN_STATES } from '@/lib/api/requests'
import type { FormState } from '@/lib/validation'

const LABELS: Record<AddressField, string> = {
  label: 'Label',
  recipient_name: 'Recipient’s name',
  phone: 'Phone number',
  street: 'Street address',
  city: 'Town or city',
  state: 'State',
  landmark: 'Landmark',
  is_default: 'Default address',
}

export type AddressDefaults = Partial<Record<Exclude<AddressField, 'is_default'>, string>> & { id?: number; version?: number; isDefault?: boolean }

/**
 * The address form: labelled fields, inline errors linked with
 * aria-describedby, an error summary that takes focus, and the values kept
 * after an error (React resets a form after its action runs, so the action
 * sends back what was typed).
 */
export function AddressForm({ defaults = {}, after, submitLabel = 'Save address' }: { defaults?: AddressDefaults; after?: 'checkout'; submitLabel?: string }) {
  const [state, action] = useActionState(saveAddress, { status: 'idle' } satisfies FormState<AddressField>)
  const v = (name: Exclude<AddressField, 'is_default'>) => state.values?.[name] ?? defaults[name] ?? ''
  const e = (name: AddressField) => state.fieldErrors?.[name]

  return (
    <form action={action} noValidate className="space-y-4">
      <ErrorSummary state={state} labels={LABELS} />
      {defaults.id ? (
        <>
          <input type="hidden" name="id" value={defaults.id} />
          <input type="hidden" name="version" value={defaults.version} />
        </>
      ) : null}
      {after ? <input type="hidden" name="after" value={after} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="recipient_name" label={LABELS.recipient_name} autoComplete="name" defaultValue={v('recipient_name')} errors={e('recipient_name')} required />
        <TextField name="phone" label={LABELS.phone} type="tel" inputMode="tel" autoComplete="tel" hint="The courier calls this, e.g. 0803 123 4567." defaultValue={v('phone')} errors={e('phone')} required />
      </div>
      <TextField name="street" label={LABELS.street} autoComplete="street-address" defaultValue={v('street')} errors={e('street')} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="city" label={LABELS.city} autoComplete="address-level2" defaultValue={v('city')} errors={e('city')} required />
        <SelectField name="state" label={LABELS.state} autoComplete="address-level1" defaultValue={v('state')} errors={e('state')} required>
          <option value="">Choose a state</option>
          {NIGERIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s === 'FCT' ? 'FCT (Abuja)' : s}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="landmark" label={`${LABELS.landmark} (optional)`} hint="“Opposite the Mobil filling station”" defaultValue={v('landmark')} errors={e('landmark')} />
        <TextField name="label" label={`${LABELS.label} (optional)`} hint="Home, Office, Mum’s place…" defaultValue={v('label')} errors={e('label')} />
      </div>
      {!defaults.isDefault ? (
        <label className="flex min-h-11 items-center gap-2.5 font-semibold">
          <input type="checkbox" name="is_default" defaultChecked={!defaults.id} className="size-5 accent-brand" />
          Make this my default address
        </label>
      ) : null}
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      <p role="status" className="text-sm font-semibold text-success empty:sr-only">
        {state.status === 'success' ? state.message : ''}
      </p>
    </form>
  )
}
