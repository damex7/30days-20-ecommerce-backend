import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'
import { TEST_CARD } from '@/lib/paystack'
import { isDemoMode } from '@/lib/services/demo'
import { AnnounceOnce } from './announce-once'

/**
 * The slim banner shown on every page while in a DEMO account. Part of the
 * normal page flow (not fixed or sticky), so on a 360px phone it pushes the
 * page down instead of covering it.
 */
export async function DemoBanner() {
  if (!isDemoMode()) return null
  let current = null
  try {
    current = await getCurrentSession()
  } catch (error) {
    rethrowNextErrors(error)
    return null
  }
  if (!current?.user.isDemo) return null
  const role = current.user.role
  const message = `You’re exploring a demo as ${role === 'customer' ? 'a customer' : role === 'staff' ? 'staff (read-only)' : 'an admin (read-only)'}. Payments use Paystack test mode, no real money.`

  return (
    <aside aria-label="Demo mode" className="border-b border-khaki bg-khaki-soft text-ink">
      <AnnounceOnce message={message} />
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-sm sm:px-6">
        <p className="min-w-0 flex-1 basis-60" aria-hidden>
          <span className="stamp mr-2 rounded-control bg-khaki px-1.5 py-0.5 text-[0.65rem] text-on-khaki">Demo</span>
          {message}
        </p>
        <details className="relative">
          <summary className="min-h-9 cursor-pointer content-center font-semibold text-khaki underline">Test card</summary>
          <dl className="figures absolute right-0 z-30 mt-1 grid w-64 grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-control border border-line-strong bg-raised p-3 font-mono text-xs shadow-pop max-sm:left-0 max-sm:right-auto">
            <dt className="text-muted">Card</dt>
            <dd>{TEST_CARD.number}</dd>
            <dt className="text-muted">Expiry</dt>
            <dd>{TEST_CARD.expiry}</dd>
            <dt className="text-muted">CVV</dt>
            <dd>{TEST_CARD.cvv}</dd>
            <dt className="text-muted">PIN</dt>
            <dd>{TEST_CARD.pin}</dd>
            <dt className="text-muted">OTP</dt>
            <dd>{TEST_CARD.otp}</dd>
          </dl>
        </details>
        {/* Exit = sign out: a POST, never a link (see components/site/sign-out-button.tsx). */}
        <form method="post" action="/logout">
          <button type="submit" className="inline-flex min-h-9 items-center rounded-control border border-khaki bg-raised px-3 font-semibold text-khaki hover:bg-khaki-soft">
            Exit demo
          </button>
        </form>
      </div>
    </aside>
  )
}
