'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { startDemo } from '@/app/(auth)/demo-actions'
import { Icon, type IconName } from '@/components/ui/icon'
import type { FormState } from '@/lib/validation'

const CHOICES: { role: 'customer' | 'staff' | 'admin'; label: string; hint: string; icon: IconName }[] = [
  { role: 'customer', label: 'Shop as a customer', hint: 'A fresh account with an address and two items in the cart. Pay with Paystack’s test card.', icon: 'cart' },
  { role: 'staff', label: 'View as staff', hint: 'Orders, products and stock. Read-only.', icon: 'package' },
  { role: 'admin', label: 'View as admin', hint: 'Everything, including coupons, users, API keys and the webhook log. Read-only.', icon: 'shield' },
]

function Choice({ choice }: { choice: (typeof CHOICES)[number] }) {
  const { pending, data } = useFormStatus()
  const mine = pending && data?.get('role') === choice.role
  return (
    <button
      type="submit"
      name="role"
      value={choice.role}
      disabled={pending}
      aria-describedby={`demo-${choice.role}-hint`}
      className="group flex w-full items-start gap-3 rounded-control border border-line-strong bg-paper p-3 text-left transition-colors hover:border-brand hover:bg-tint disabled:cursor-wait disabled:opacity-70"
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-brand text-on-brand">
        <Icon name={mine ? 'clock' : choice.icon} />
      </span>
      <span>
        <span className="block font-bold">{mine ? 'Opening the demo…' : choice.label}</span>
        <span id={`demo-${choice.role}-hint`} className="block text-sm text-muted">
          {choice.hint}
        </span>
      </span>
    </button>
  )
}

/** One form, three submit buttons: the clicked one's name/value says which role. */
export function DemoButtons() {
  const [state, action] = useActionState(startDemo, { status: 'idle' } satisfies FormState)
  return (
    <form action={action} className="space-y-2.5">
      <p role="status" className="text-sm font-semibold text-danger empty:sr-only">
        {state.status === 'error' ? state.message : ''}
      </p>
      {CHOICES.map((choice) => (
        <Choice key={choice.role} choice={choice} />
      ))}
    </form>
  )
}
