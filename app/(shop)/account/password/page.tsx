import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ChangePasswordForm } from '@/components/account/account-forms'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Notice } from '@/components/ui/notice'
import { verifySession } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Change password' }

export default function PasswordPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Password />
    </Suspense>
  )
}

/**
 * Also the ONLY page a person with a temporary password can open:
 * verifySession() (lib/auth/dal.ts) redirects every other page and action
 * here until they've chosen their own password.
 */
async function Password() {
  const { user } = await verifySession()
  const temporary = user.mustChangePassword

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl">{temporary ? 'Choose your password' : 'Change password'}</h1>
        <p className="mt-2 text-muted">Every other device signed in to your account will be signed out.</p>
      </div>
      {temporary ? (
        <Notice tone="info" title={`Welcome, ${user.name}`}>
          <p>Your admin gave you a temporary password. Before you start, replace it with one only you know.</p>
        </Notice>
      ) : null}
      <section aria-label="New password" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <ChangePasswordForm email={user.email} name={user.name} temporary={temporary} />
      </section>
    </div>
  )
}
