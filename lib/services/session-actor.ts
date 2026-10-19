// THE ACTOR FOR MY OWN PAGES AND SERVER ACTIONS.
//
// My pages call the services DIRECTLY, never my own API over HTTP. A
// fetch from the server to itself would add a network hop for nothing, need
// the session cookie forwarded by hand, lose the TypeScript types at the
// JSON boundary, and turn one request into two (two sets of logs, two
// places to fail). Both transports reach the same services, so the rules
// are identical either way.
import 'server-only'

import { getCurrentSession, verifySession } from '@/lib/auth/dal'
import { anonymous, userActor, type Actor, type UserActor } from './actor'

/** Whoever is signed in, or anonymous. For public pages (the shop). */
export async function getPageActor(): Promise<Actor> {
  const current = await getCurrentSession()
  return current ? userActor(current.user) : anonymous
}

/** A signed-in user, or a redirect to /login (Day 17's verifySession). */
export async function requirePageActor(): Promise<UserActor> {
  const { user } = await verifySession()
  return userActor(user)
}
