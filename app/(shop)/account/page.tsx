import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { ProfileForm } from '@/components/account/account-forms'
import { AddressForm } from '@/components/shop/address-form'
import { StatusBadge } from '@/components/shop/status-badge'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { ActionButton } from '@/components/forms/action-button'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { SignOutButton } from '@/components/site/sign-out-button'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { formatDate } from '@/lib/dates'
import { formatNaira } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { listAddresses } from '@/lib/services/addresses'
import { isServiceError } from '@/lib/services/errors'
import { listOrders } from '@/lib/services/orders'
import { requirePageActor } from '@/lib/services/session-actor'
import { makeDefault, removeAddress } from './address-actions'

export const metadata: Metadata = { title: 'Your account' }

const ROLE_LABELS = { customer: 'Customer', staff: 'Staff', admin: 'Admin' } as const

export default function AccountPage({ searchParams }: PageProps<'/account'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account searchParams={searchParams} />
    </Suspense>
  )
}

async function Account({ searchParams }: Pick<PageProps<'/account'>, 'searchParams'>) {
  const actor = await requirePageActor()
  const { user } = actor
  const params = await searchParams
  const customer = user.role === 'customer'
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined

  return (
    <div className="space-y-6">
      {params.denied === 'role' ? (
        <Notice tone="info" title="That page is for shop staff">
          <p>You’ve been brought to your own account instead.</p>
        </Notice>
      ) : null}
      <div>
        <h1 className="text-4xl">Your account</h1>
        <p className="mt-2 text-muted">
          {ROLE_LABELS[user.role]}
          {user.isDemo ? ' (demo)' : ''} · since {formatDate(user.createdAt)}
        </p>
      </div>

      {customer ? (
        <Section id="orders" title="Your orders">
          <Suspense fallback={<div className="skeleton h-40 w-full" />}>
            <Orders cursor={cursor} />
          </Suspense>
        </Section>
      ) : (
        <Notice tone="info" title="You run the shop">
          <p>
            Orders, products and stock are in <Link href="/admin">the workshop</Link>.
          </p>
        </Notice>
      )}

      {customer ? (
        <Section id="addresses" title="Delivery addresses">
          <Suspense fallback={<div className="skeleton h-40 w-full" />}>
            <Addresses />
          </Suspense>
        </Section>
      ) : null}

      <Section id="profile" title="Profile">
        <ProfileForm name={user.name} phone={user.phone} />
        <div className="mt-6 border-t border-line pt-5">
          <p className="font-semibold">Email address</p>
          <p className="mt-0.5 break-all">
            {user.email}{' '}
            <span className={user.emailVerifiedAt ? 'font-semibold text-success' : 'font-semibold text-khaki'}>({user.emailVerifiedAt ? 'confirmed' : 'not confirmed yet'})</span>
          </p>
        </div>
      </Section>

      <Section id="security" title="Security">
        {user.isDemo ? <p className="mb-4 text-muted">Demo accounts have no password; they’re deleted after 24 hours.</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          {!user.isDemo ? (
            <Link href="/account/password" className={button.secondary}>
              <Icon name="lock" />
              Change password
            </Link>
          ) : null}
          <Link href="/account/sessions" className={button.secondary}>
            <Icon name="laptop" />
            Signed-in devices
          </Link>
          <SignOutButton withLabel />
        </div>
      </Section>
    </div>
  )
}

async function Orders({ cursor }: { cursor?: string }) {
  const actor = await requirePageActor()
  let page
  try {
    page = await listOrders(actor, { cursor, limit: 10 })
  } catch (error) {
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    page = await listOrders(actor, { limit: 10 })
  }
  if (page.items.length === 0) {
    return (
      <EmptyState title="No orders yet">
        <Link href="/products">Find something you like</Link>.
      </EmptyState>
    )
  }
  return (
    <>
      <ul className="divide-y divide-dashed divide-line">
        {page.items.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div>
              <Link href={`/account/orders/${o.id}`} className="font-mono font-bold">
                {o.number}
              </Link>
              <p className="text-sm text-muted">
                {formatDate(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'} · <span className="figures">{formatNaira(o.totalKobo)}</span>
              </p>
            </div>
            <StatusBadge status={o.status} />
          </li>
        ))}
      </ul>
      {page.nextCursor ? (
        <Link href={`/account?cursor=${encodeURIComponent(page.nextCursor)}#orders-title`} className={`${button.secondary} mt-4`}>
          Older orders
          <Icon name="arrowRight" />
        </Link>
      ) : cursor ? (
        <Link href="/account#orders-title" className={`${button.ghost} mt-4`}>
          Back to the newest
        </Link>
      ) : null}
    </>
  )
}

async function Addresses() {
  const actor = await requirePageActor()
  const addresses = await listAddresses(actor)
  return (
    <div className="space-y-4">
      {addresses.length === 0 ? <p className="text-muted">No saved addresses yet.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="rounded-control border border-line-strong bg-paper p-4">
            <p className="font-bold">
              {a.label ?? a.recipientName}
              {a.isDefault ? <span className="stamp ml-2 rounded-control bg-brand px-1.5 py-0.5 text-[0.6rem] text-on-brand">Default</span> : null}
            </p>
            <p className="text-sm">
              {a.recipientName} · {formatPhone(a.phone)}
              <br />
              {a.street}, {a.city}, {a.state}
            </p>
            {a.landmark ? <p className="text-sm text-muted">{a.landmark}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {!a.isDefault ? (
                <ActionButton action={makeDefault} fields={{ id: String(a.id), version: String(a.version), back: '/account#addresses-title' }} pendingLabel="Saving…">
                  Make default
                </ActionButton>
              ) : null}
              <ConfirmAction
                action={removeAddress}
                fields={{ id: String(a.id) }}
                trigger="Delete"
                icon="trash"
                title="Delete this address?"
                body={<p>Past orders keep the address they were sent to; only your address book changes.</p>}
                confirmLabel="Delete address"
                danger
              />
            </div>
            <details className="mt-3">
              <summary className="min-h-9 cursor-pointer content-center text-sm font-semibold">Edit</summary>
              <div className="mt-3">
                <AddressForm
                  defaults={{ id: a.id, version: a.version, isDefault: a.isDefault, label: a.label ?? '', recipient_name: a.recipientName, phone: formatPhone(a.phone), street: a.street, city: a.city, state: a.state, landmark: a.landmark ?? '' }}
                  submitLabel="Save changes"
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="rounded-control border border-dashed border-line-strong p-3">
        <summary className="min-h-9 cursor-pointer content-center font-semibold">Add an address</summary>
        <div className="mt-3">
          <AddressForm />
        </div>
      </details>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
      <h2 id={`${id}-title`} className="mb-5 text-2xl">
        {title}
      </h2>
      {children}
    </section>
  )
}
