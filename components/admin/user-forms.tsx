'use client'

import { useActionState } from 'react'
import { changeUserAction, createStaffAction } from '@/app/(shop)/admin/users/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SelectField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { CopyButton } from '@/components/ui/copy-button'
import type { FormState } from '@/lib/validation'

export function UserControls({ id, name, role, active, locked, lockedReason }: { id: string; name: string; role: string; active: boolean; locked: boolean; lockedReason?: string }) {
  const [state, action] = useActionState(changeUserAction, { status: 'idle' } satisfies FormState)
  const reasonId = `locked-${id}`
  return (
    <div className="space-y-1">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="text-sm">
          <span className="block font-semibold">
            Role<span className="sr-only"> for {name}</span>
          </span>
          <select name="role" defaultValue={role} disabled={locked} aria-describedby={locked ? reasonId : undefined} className="field min-h-10 px-2">
            <option value="customer">Customer</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <SubmitButton variant="small" pendingLabel="…" disabled={locked} describedBy={locked ? reasonId : undefined}>
          Save role
        </SubmitButton>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(!active)} />
        <SubmitButton variant="small" pendingLabel="…" disabled={locked} describedBy={locked ? reasonId : undefined} className={active ? 'text-danger' : ''}>
          {active ? 'Deactivate' : 'Reactivate'}
          <span className="sr-only"> {name}</span>
        </SubmitButton>
      </form>
      {locked && lockedReason ? (
        <p id={reasonId} className="text-xs text-muted">
          {lockedReason}
        </p>
      ) : null}
      <p role="status" className={`text-sm font-semibold empty:sr-only ${state.status === 'error' ? 'text-danger' : 'text-success'}`}>
        {state.status !== 'idle' ? state.message : ''}
      </p>
    </div>
  )
}

export function NewStaffForm({ readOnly, readOnlyId }: { readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(createStaffAction, { status: 'idle' } satisfies FormState<'name' | 'email' | 'role' | 'password'>)
  if (state.status === 'success' && state.values?.password) {
    return (
      <div role="status" className="space-y-3 rounded-control border-2 border-success bg-success-soft p-4">
        <p className="font-bold text-success">{state.message}</p>
        <p className="font-mono text-lg break-all">{state.values.password}</p>
        <CopyButton text={state.values.password} label="Copy password" done="Copied. Hand it over in person or on WhatsApp." />
        <p className="text-sm">They must choose their own password at first sign-in. It isn’t emailed and can’t be shown again.</p>
      </div>
    )
  }
  return (
    <form action={action} noValidate className="space-y-4">
      <ErrorSummary state={state} labels={{ name: 'Name', email: 'Email', role: 'Role' }} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="name" label="Name" defaultValue={state.values?.name} errors={state.fieldErrors?.name} />
        <TextField name="email" label="Email" type="email" defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
        <SelectField name="role" label="Role" defaultValue={state.values?.role ?? 'staff'} errors={state.fieldErrors?.role}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </SelectField>
      </div>
      <SubmitButton pendingLabel="Creating…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Create staff account
      </SubmitButton>
    </form>
  )
}
