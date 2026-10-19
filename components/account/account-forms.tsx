'use client'

import { useActionState } from 'react'
import { changePasswordAction, updateProfileAction } from '@/app/(shop)/account/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { PasswordField } from '@/components/forms/password-field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import { formatPhone } from '@/lib/phone'
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PHONE_MAX, type FormState } from '@/lib/validation'

export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const [state, action] = useActionState(updateProfileAction, { status: 'idle' } satisfies FormState<'name' | 'phone'>)
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ name: 'Name', phone: 'Mobile number' }} />
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saved'} className="mb-5" live /> : null}
      <div className="space-y-5">
        <TextField
          name="name"
          label="Name"
          autoComplete="name"
          required
          maxLength={NAME_MAX}
          defaultValue={state.values?.name ?? name}
          errors={state.fieldErrors?.name}
        />
        <TextField
          name="phone"
          type="tel"
          label="Mobile number (optional)"
          hint="So the studio can reach you if something changes."
          autoComplete="tel"
          inputMode="tel"
          maxLength={PHONE_MAX}
          defaultValue={state.values?.phone ?? (phone ? formatPhone(phone) : '')}
          errors={state.fieldErrors?.phone}
        />
        <SubmitButton variant="secondary">Save details</SubmitButton>
      </div>
    </form>
  )
}

type PasswordFields = 'currentPassword' | 'newPassword'

export function ChangePasswordForm({ email, name, temporary = false }: { email: string; name: string; temporary?: boolean }) {
  const [state, action] = useActionState(changePasswordAction, { status: 'idle' } satisfies FormState<PasswordFields>)
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ currentPassword: 'Current password', newPassword: 'New password' }} />
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Password changed'} className="mb-5" live /> : null}
      {/* Tells password managers which account the new password belongs to. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="space-y-5">
        <PasswordField key={`c${state.submissionId}`} name="currentPassword" label={temporary ? 'Temporary password' : 'Current password'} hint={temporary ? 'The one your admin gave you.' : undefined} autoComplete="current-password" errors={state.fieldErrors?.currentPassword} />
        <PasswordField
          key={`n${state.submissionId}`}
          name="newPassword"
          label="New password"
          autoComplete="new-password"
          showStrength
          userInputs={[name, email]}
          hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters. Every other device will be signed out.`}
          errors={state.fieldErrors?.newPassword}
        />
        <SubmitButton>{temporary ? 'Set my password' : 'Change password'}</SubmitButton>
      </div>
    </form>
  )
}

