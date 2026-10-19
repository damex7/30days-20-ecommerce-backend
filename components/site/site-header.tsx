import Link from 'next/link'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'
import { userActor } from '@/lib/services/actor'
import { cartCount } from '@/lib/services/cart'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'

/**
 * The header on every page. The logo, the shop links and the theme toggle
 * are static; the right-hand side depends on the session cookie, so it
 * sits in <Suspense> and streams in. The page never waits for it.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-page items-center gap-1 px-3 py-2 sm:gap-2 sm:px-6">
        <Logo />
        <nav aria-label="Shop" className="flex items-center">
          <Link href="/products" className={`${button.ghost} px-2.5 sm:px-3`}>
            <Icon name="store" className="sm:hidden" />
            <span className="max-sm:sr-only">Shop</span>
          </Link>
          <Link href="/docs" className={`${button.ghost} px-2.5 sm:px-3`}>
            <Icon name="code" className="sm:hidden" />
            <span className="max-sm:sr-only">API</span>
          </Link>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Suspense fallback={<span className="skeleton block h-11 w-20 sm:w-48" />}>
            <AccountControls />
          </Suspense>
        </div>
      </div>
    </header>
  )
}

async function AccountControls() {
  let current = null
  let count = 0
  try {
    current = await getCurrentSession()
    if (current?.user.role === 'customer') count = await cartCount(userActor(current.user))
  } catch (error) {
    // A database problem shouldn't take the whole page down from the
    // header: show "signed out" here, and let the page's own boundary speak.
    rethrowNextErrors(error)
    console.error('[header] Could not read the session:', error)
  }

  if (!current) {
    return (
      <Link href="/login" className={`${button.primary} px-3 whitespace-nowrap`}>
        Sign in
      </Link>
    )
  }

  const { role, name } = current.user
  return (
    <>
      {role === 'customer' ? (
        <Link href="/cart" className={`${button.ghost} relative px-2.5`} aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
          <Icon name="cart" />
          {count > 0 ? (
            <span aria-hidden className="figures absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-pill bg-brand px-1 text-xs font-bold text-on-brand">
              {count}
            </span>
          ) : null}
        </Link>
      ) : (
        <Link href="/admin" className={`${button.secondary} px-3`}>
          <Icon name="dashboard" />
          <span className="max-sm:sr-only">Workshop</span>
        </Link>
      )}
      <Link href="/account" className={`${button.ghost} max-w-40 px-2.5`} aria-label={`Your account (${name})`}>
        <Icon name="user" />
        <span className="truncate max-md:hidden">{name}</span>
      </Link>
      <div className="max-sm:hidden">
        <SignOutButton />
      </div>
    </>
  )
}
