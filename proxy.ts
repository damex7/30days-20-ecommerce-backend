// PROXY: runs before every request. Four quick jobs, and deliberately not a fifth.
//
// 1. A REQUEST ID. Every request gets an X-Request-Id (or keeps a sane one
//    the client sent). It's passed to the page or route handler, written in
//    the server log line, and sent back in the response, so "it failed,
//    request id 7f9c…" leads straight to the log.
//
// 2. OPTIMISTIC REDIRECT: a protected page with NO session cookie at all
//    goes straight to /login?next=…. "Optimistic" because a cookie being
//    present proves nothing; the real check is in the DAL and the services.
//
// 3. COOKIE REFRESH: sliding renewal moves the session's expires_at in the
//    database, but pages can't write cookies while rendering, so the proxy
//    re-sends the same cookie with a fresh Max-Age on page loads.
//
// 4. AN HONEST 404 for /account/orders/<id> and /admin/orders/<id> when that
//    order isn't yours (one indexed query, only on those URLs).
//
// What it does NOT do: protect anything on its own. Pages, Server Actions
// and API routes all check the actor themselves, in the service layer.
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie'
import { hashToken } from '@/lib/auth/tokens'
import { orderVisibility } from '@/lib/repos/visibility'

const PROTECTED_PREFIXES = ['/account', '/admin', '/cart', '/checkout']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

const ORDER_PATH = /^\/(?:account|admin)\/orders\/(\d{1,15})(?:\/|$)/
const REQUEST_ID = /^[A-Za-z0-9._-]{8,80}$/

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const sentId = request.headers.get('x-request-id')
  const requestId = sentId && REQUEST_ID.test(sentId) ? sentId : crypto.randomUUID()

  // The API answers for itself (401 problem+json, never a redirect).
  const isApi = pathname.startsWith('/api/')

  if (!isApi) {
    const orderMatch = token ? ORDER_PATH.exec(pathname) : null
    if (token && orderMatch?.[1] && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const visibility = await orderVisibility(hashToken(token), Number(orderMatch[1])).catch((error: unknown) => {
        // The page still checks ownership itself; only the status code is at stake here.
        console.error('[proxy] order visibility check failed:', error)
        return 'visible' as const
      })
      if (visibility === 'hidden') {
        // Rewritten to a path that has NO route, so Next.js itself renders
        // app/not-found.tsx with a genuine 404 status. (A rewrite to a real
        // page with { status: 404 } isn't enough under Cache Components: the
        // page's static shell is already streaming with 200.) Headers are set
        // AFTER creating the response: passing `headers` to rewrite()
        // replaces the internal header that marks the rewrite.
        const notFound = NextResponse.rewrite(new URL('/_order-not-found', request.url))
        notFound.headers.set('X-Request-Id', requestId)
        return notFound
      }
    }

    if (isProtected(pathname) && !token) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', pathname + search)
      const redirect = NextResponse.redirect(login)
      redirect.headers.set('X-Request-Id', requestId)
      return redirect
    }
  }

  // Pass the request id and the path on to the page / route handler. Both
  // headers are always overwritten here, so a visitor can't supply them.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('x-oja-path', pathname + search)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('X-Request-Id', requestId)

  if (!isApi && token && request.method === 'GET') {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  }
  return response
}

export const config = {
  // Every page and route, but not Next.js's own files or static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|products/.*\\.(?:svg|png|jpg|webp)$|.*\\.(?:png|jpg|svg|webp|ico|txt)$).*)'],
}
