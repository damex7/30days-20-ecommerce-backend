'use client'

import { useActionState } from 'react'
import { createKeyAction } from '@/app/(shop)/admin/api-keys/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { FieldError, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { CopyButton } from '@/components/ui/copy-button'
import type { FormState } from '@/lib/validation'

const SCOPES = [
  { value: 'catalog:read', hint: 'List products (including drafts) and categories' },
  { value: 'catalog:write', hint: 'Create and edit products, variants, stock and images' },
  { value: 'orders:read', hint: 'List and read every order' },
  { value: 'orders:write', hint: 'Move orders along (processing, shipped, delivered) and add notes' },
] as const

export function ApiKeyForm({ readOnly, readOnlyId }: { readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(createKeyAction, { status: 'idle' } satisfies FormState<'name' | 'scopes' | 'expires_on' | 'expires_at' | 'secret'>)

  if (state.status === 'success' && state.values?.secret) {
    return (
      <div role="status" className="space-y-3 rounded-control border-2 border-success bg-success-soft p-4">
        <p className="font-bold text-success">{state.message}</p>
        <p className="rounded-control bg-raised p-3 font-mono text-sm break-all">{state.values.secret}</p>
        <CopyButton text={state.values.secret} label="Copy key" done="Copied. Store it in the integration’s secret settings." />
        <p className="text-sm">
          Use it as <code>Authorization: Bearer {state.values.secret.slice(0, 15)}…</code>. Only its SHA-256 hash is kept, so if it’s lost, revoke it and make a new one.
        </p>
      </div>
    )
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <ErrorSummary state={state} labels={{ name: 'Name', scopes: 'Scopes', expires_on: 'Expires', expires_at: 'Expires' }} />
      <TextField name="name" label="What is it for?" hint="e.g. GIG Logistics courier, Stock sync" defaultValue={state.values?.name} errors={state.fieldErrors?.name} maxLength={60} />
      <fieldset aria-describedby={state.fieldErrors?.scopes ? 'scopes-error' : undefined}>
        <legend className="mb-1.5 font-semibold">Scopes: what the key may do</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SCOPES.map((s) => (
            <label key={s.value} className="flex cursor-pointer gap-2.5 rounded-control border border-line-strong bg-paper p-3 has-checked:border-brand has-checked:bg-tint">
              <input type="checkbox" name="scopes" value={s.value} className="mt-1 size-4 accent-brand" />
              <span>
                <span className="block font-mono text-sm font-bold">{s.value}</span>
                <span className="text-sm text-muted">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError name="scopes" errors={state.fieldErrors?.scopes} />
      </fieldset>
      <TextField name="expires_on" type="date" label="Expires (optional)" hint="After the end of this day (Lagos time) the key stops working." defaultValue={state.values?.expires_on} errors={state.fieldErrors?.expires_on ?? state.fieldErrors?.expires_at} />
      <SubmitButton pendingLabel="Creating…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Create key
      </SubmitButton>
    </form>
  )
}
