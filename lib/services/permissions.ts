// WHO MAY DO WHAT: one table, one function.
//
// Every service function starts with authorize(actor, '<permission>'). The
// table below is the whole access policy for roles, API-key scopes and demo
// accounts, so the README's "Who can do what" table is a copy of it, and
// changing a rule means changing one line here, not hunting through pages,
// route handlers and actions.
//
// THE READ-ONLY DEMO RULE lives here too, and only here. A permission
// marked `write: true` is refused for demo staff and demo admin with the
// same friendly message, whichever way the request arrived (a Server
// Action from the admin page, or a PATCH to the API). Hiding buttons in the
// UI is only a courtesy; this is the lock.
//
// Two things this does NOT decide:
//   - OWNERSHIP ("is this YOUR order?") is decided by the SQL, which filters
//     on customer_id, and answers 404 (lib/repos/orders.ts).
//   - Which order STATUS moves are allowed: lib/services/order-status.ts.
import 'server-only'

import type { Role } from '@/lib/validation'
import type { Actor, ApiScope } from './actor'
import { DEMO_READ_ONLY_MESSAGE, forbidden, ServiceError, unauthorized } from './errors'

type Rule = {
  /** Session roles allowed. */
  roles: readonly Role[]
  /** The API-key scope that allows it; absent = API keys may not do this at all. */
  scope?: ApiScope
  /** A write: refused for demo staff/admin (read-only demo). */
  write: boolean
  /** Also refused for demo CUSTOMERS (their login details can't change). */
  notForDemoCustomers?: boolean
  /** Admin-only rules also need a verified email (Day 17): an unverified admin may not own that inbox. */
  needsVerifiedEmail?: boolean
}

const CUSTOMER: readonly Role[] = ['customer']
const STAFF: readonly Role[] = ['staff', 'admin']
const ADMIN: readonly Role[] = ['admin']
const EVERYONE: readonly Role[] = ['customer', 'staff', 'admin']

export const PERMISSIONS = {
  // The catalogue. Reading ACTIVE products is public (no authorize call);
  // these are for the staff view that includes drafts, and for changes.
  'catalog.read_all': { roles: STAFF, scope: 'catalog:read', write: false },
  'catalog.write': { roles: STAFF, scope: 'catalog:write', write: true },

  // A customer's own things. Keys have no cart: an order belongs to a person.
  'cart.own': { roles: CUSTOMER, write: true },
  'addresses.own': { roles: CUSTOMER, write: true },
  'orders.place': { roles: CUSTOMER, write: true },
  'orders.read_own': { roles: CUSTOMER, write: false },
  'orders.cancel_own': { roles: CUSTOMER, write: true },
  'orders.pay_own': { roles: CUSTOMER, write: true },

  // The shop side of orders.
  'orders.read_all': { roles: STAFF, scope: 'orders:read', write: false },
  'orders.fulfil': { roles: STAFF, scope: 'orders:write', write: true }, // processing → shipped → delivered, notes
  'orders.refund': { roles: STAFF, write: true }, // cancel a PAID order (→ refunded): people only, never a key

  // Profile. Everyone may edit their name; demo customers can't change login details.
  'profile.read': { roles: EVERYONE, write: false },
  'profile.update': { roles: EVERYONE, write: true },
  'account.credentials': { roles: EVERYONE, write: true, notForDemoCustomers: true },

  // Admin only, and never through an API key: these change who can do what.
  'coupons.read': { roles: ADMIN, write: false },
  'coupons.manage': { roles: ADMIN, write: true, needsVerifiedEmail: true },
  'delivery_fees.manage': { roles: ADMIN, write: true, needsVerifiedEmail: true },
  'users.read': { roles: ADMIN, write: false },
  'users.manage': { roles: ADMIN, write: true, needsVerifiedEmail: true },
  'api_keys.read': { roles: ADMIN, write: false },
  'api_keys.manage': { roles: ADMIN, write: true, needsVerifiedEmail: true },
  'payment_events.read': { roles: ADMIN, write: false },
} as const satisfies Record<string, Rule>

export type Permission = keyof typeof PERMISSIONS

/** Throws a ServiceError (401 / 403) unless the actor may do this. Returns quietly if they may. */
export function authorize(actor: Actor, permission: Permission): void {
  const rule: Rule = PERMISSIONS[permission]

  switch (actor.kind) {
    case 'system':
      // The app itself (the expiry sweep, the webhook) is trusted.
      return

    case 'anonymous':
      throw unauthorized()

    case 'api_key': {
      if (!rule.scope) {
        throw forbidden('session_required', 'API keys can’t do this. Sign in with an account that has the right role.')
      }
      if (!actor.key.scopes.includes(rule.scope)) {
        throw forbidden('missing_scope', `This API key doesn’t have the "${rule.scope}" scope.`)
      }
      return
    }

    case 'user': {
      const { user } = actor
      if (!rule.roles.includes(user.role)) {
        throw forbidden('wrong_role', 'Your account isn’t allowed to do this.')
      }
      if (rule.needsVerifiedEmail && !user.emailVerifiedAt) {
        throw forbidden('email_not_verified', 'Confirm your email address first.')
      }
      if (user.isDemo) {
        // THE READ-ONLY DEMO RULE. Demo staff and admin may look at
        // everything, but every write stops here.
        if (rule.write && user.role !== 'customer') throw demoReadOnly()
        // A demo customer may shop, but not change their login details.
        if (rule.notForDemoCustomers) {
          throw forbidden('demo_account', 'Demo accounts can’t change their email or password. They are deleted after 24 hours.')
        }
      }
      return
    }
  }
}

/** Same as authorize, but answers true/false (for deciding what to SHOW, never what to allow). */
export function can(actor: Actor, permission: Permission): boolean {
  try {
    authorize(actor, permission)
    return true
  } catch (error) {
    if (error instanceof ServiceError) return false
    throw error
  }
}

export function demoReadOnly(): ServiceError {
  return forbidden('demo_read_only', DEMO_READ_ONLY_MESSAGE)
}

/** True when the UI should show change buttons DISABLED with the demo explanation. */
export function isReadOnlyDemo(actor: Actor): boolean {
  return actor.kind === 'user' && actor.user.isDemo && actor.user.role !== 'customer'
}
