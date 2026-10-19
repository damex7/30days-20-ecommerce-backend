import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { AuthCard, FormSkeleton } from '@/components/site/auth-card'
import { safeNextPath } from '@/lib/safe-redirect'

export const metadata: Metadata = { title: 'Create an account' }

/**
 * Open sign-up (Day 19). Every account made here is a CLIENT: the role is
 * fixed in SQL (lib/users.ts createUser), not taken from the form.
 */
export default function SignUpPage({ searchParams }: PageProps<'/signup'>) {
  return (
    <AuthCard title="Create an account" intro="Book appointments and manage them in one place. We’ll email you a link to confirm your address.">
      <Suspense fallback={<FormSkeleton />}>
        <SignUpContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

async function SignUpContent({ searchParams }: Pick<PageProps<'/signup'>, 'searchParams'>) {
  const raw = (await searchParams).next
  // Checked here as well as at login: only a path on this site survives.
  const next = typeof raw === 'string' ? safeNextPath(raw, '') : ''
  return <SignUpForm next={next || null} />
}
