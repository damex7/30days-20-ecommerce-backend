import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { NewStaffForm, UserControls } from '@/components/admin/user-forms'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatDate } from '@/lib/dates'
import { isServiceError } from '@/lib/services/errors'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireAdminActor } from '@/lib/services/session-actor'
import { listUsers } from '@/lib/services/users'
import { firstValues } from '@/lib/shop-query'

export const metadata: Metadata = { title: 'Users' }

export default function UsersPage({ searchParams }: PageProps<'/admin/users'>) {
  return (
    <>
      <PageHeader title="Users and roles" description="Customers sign up themselves. Staff manage products and orders; admins also manage coupons, fees, users and API keys." />
      <Suspense fallback={<TableSkeleton />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Users({ searchParams }: Pick<PageProps<'/admin/users'>, 'searchParams'>) {
  const actor = await requireAdminActor()
  const raw = firstValues(await searchParams)
  const role = raw.role === 'customer' || raw.role === 'staff' || raw.role === 'admin' ? raw.role : undefined
  const q = raw.q?.slice(0, 100)
  let page
  try {
    page = await listUsers(actor, { q, role, cursor: raw.cursor, limit: 25 })
  } catch (error) {
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    page = await listUsers(actor, { q, role, limit: 25 })
  }
  const readOnly = isReadOnlyDemo(actor)
  const keep = new URLSearchParams(Object.entries({ ...(role ? { role } : {}), ...(q ? { q } : {}) }))

  return (
    <div className="space-y-6">
      <ReadOnlyNote show={readOnly} />
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-raised p-4 shadow-card">
        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-semibold">
            Role
          </label>
          <select id="role" name="role" defaultValue={role ?? ''} className="field min-h-11 px-2">
            <option value="">Everyone</option>
            <option value="customer">Customers</option>
            <option value="staff">Staff</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">
            Name or email
          </label>
          <input id="q" name="q" type="search" defaultValue={q} className="field min-h-11 w-full px-3" />
        </div>
        <button type="submit" className={button.secondary}>
          Show
        </button>
      </form>
      <ul className="divide-y divide-dashed divide-line rounded-card border border-line bg-raised shadow-card">
        {page.items.map((u) => {
          const self = u.id === actor.user.id
          const locked = readOnly || self || u.isDemo
          return (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {u.name}
                  {u.isDemo ? <span className="stamp ml-2 text-[0.6rem] text-muted">Demo</span> : null}
                  {u.deactivatedAt ? <span className="stamp ml-2 text-[0.6rem] text-danger">Deactivated</span> : null}
                </p>
                <p className="text-sm break-all text-muted">{u.email}</p>
                <p className="text-sm text-muted">
                  {u.role} · joined {formatDate(u.createdAt)} · {u.orderCount} {u.orderCount === 1 ? 'order' : 'orders'}
                  {u.emailVerifiedAt ? '' : ' · email not confirmed'}
                </p>
              </div>
              <UserControls
                id={u.id}
                name={u.name}
                role={u.role}
                active={!u.deactivatedAt}
                locked={locked}
                lockedReason={readOnly ? 'Read-only demo.' : self ? 'You can’t change your own account.' : u.isDemo ? 'Demo accounts can’t be changed.' : undefined}
              />
            </li>
          )
        })}
      </ul>
      <nav aria-label="Pages" className="flex gap-2">
        {raw.cursor ? (
          <Link href={`/admin/users?${keep}`} className={button.secondary}>
            Back to the newest
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={`/admin/users?${new URLSearchParams([...keep, ['cursor', page.nextCursor]])}`} className={button.primary}>
            Next page
          </Link>
        ) : null}
      </nav>
      <section aria-labelledby="new-staff" className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="new-staff" className="mb-4 text-2xl">
          Add a staff member
        </h2>
        <NewStaffForm readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
      </section>
    </div>
  )
}
