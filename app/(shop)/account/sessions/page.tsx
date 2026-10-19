import type { Metadata } from 'next'
import { Suspense } from 'react'
import { revokeOtherSessionsAction, revokeSessionAction } from '@/app/(shop)/account/actions'
import { ActionButton } from '@/components/forms/action-button'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { verifySession } from '@/lib/auth/dal'
import { listSessions } from '@/lib/auth/session'
import { formatStamp, fromNow } from '@/lib/dates'
import { describeUserAgent } from '@/lib/user-agent'

export const metadata: Metadata = { title: 'Your sessions' }

export default function SessionsPage({ searchParams }: PageProps<'/account/sessions'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Sessions searchParams={searchParams} />
    </Suspense>
  )
}

function noticeText(notice: unknown, count: unknown): { tone: 'success' | 'info'; title: string } | null {
  if (notice === 'revoked') return { tone: 'success', title: 'That device was signed out' }
  if (notice === 'gone') return { tone: 'info', title: 'That session had already ended' }
  if (notice === 'others') {
    const n = Number(count) || 0
    return n === 0 ? { tone: 'info', title: 'There were no other sessions to sign out' } : { tone: 'success', title: `Signed out ${n} other ${n === 1 ? 'session' : 'sessions'}` }
  }
  return null
}

const isPhone = (userAgent: string | null) => /Android|iPhone|iPod|Mobile/.test(userAgent ?? '')

/**
 * Every browser signed in to this account. Each one is a row in the
 * sessions table, which is why it can be listed and ended from here: a
 * stateless token (a JWT) can't be "signed out remotely" until it expires.
 */
async function Sessions({ searchParams }: Pick<PageProps<'/account/sessions'>, 'searchParams'>) {
  const { user, session: current } = await verifySession()
  const [sessions, params] = await Promise.all([listSessions(user.id), searchParams])
  const notice = noticeText(params.notice, params.count)
  const others = sessions.filter((s) => s.id !== current.id).length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">Signed-in devices</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Each of these browsers holds a session key. Don’t recognise one? Sign it out, then change your password.
          </p>
        </div>
        {others > 0 ? (
          <ActionButton action={revokeOtherSessionsAction} variant="secondary" pendingLabel="Signing out…">
            Sign out everywhere else
          </ActionButton>
        ) : null}
      </div>

      {notice ? <Notice tone={notice.tone} title={notice.title} live /> : null}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sessions.map((session) => {
          const isCurrent = session.id === current.id
          return (
            <li key={session.id} className={`rounded-card border bg-raised p-5 shadow-card ${isCurrent ? 'border-brand border-2' : 'border-line'}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-control bg-tint text-ink">
                  <Icon name={isPhone(session.userAgent) ? 'phone' : 'laptop'} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 font-sans text-lg font-bold">
                    {describeUserAgent(session.userAgent)}
                    {isCurrent ? <span className="rounded-pill bg-tint px-2.5 py-0.5 text-sm font-bold text-ink">This device</span> : null}
                  </h2>
                  <p className="text-muted">
                    {session.location ?? 'Unknown location'}
                    {session.ip ? (
                      <>
                        {' · '}
                        <span className="figures text-sm">{session.ip}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[0.95rem] sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-semibold text-muted">Last active</dt>
                  <dd>
                    <time dateTime={session.lastSeenAt.toISOString()} title={formatStamp(session.lastSeenAt)}>
                      {isCurrent ? 'Now' : fromNow(session.lastSeenAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-muted">Signed in</dt>
                  <dd>
                    <time dateTime={session.createdAt.toISOString()}>{formatStamp(session.createdAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-muted">Expires</dt>
                  <dd>
                    <time dateTime={session.expiresAt.toISOString()} title={formatStamp(session.expiresAt)}>
                      {fromNow(session.expiresAt)}
                    </time>
                  </dd>
                </div>
              </dl>
              <ActionButton action={revokeSessionAction} fields={{ sessionId: session.id }} className="mt-4" pendingLabel="Signing out…">
                {isCurrent ? 'Sign out of this device' : 'Sign out this device'}
              </ActionButton>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
