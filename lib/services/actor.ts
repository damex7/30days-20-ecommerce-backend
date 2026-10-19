// THE ACTOR: who is asking. Every service function takes one as its FIRST
// argument, so "who may do this?" is never an afterthought.
//
//   user      : a person signed in with the session cookie (my own pages,
//               the storefront, a mobile app that logged in)
//   api_key   : an integration sending Authorization: Bearer oja_live_...
//   system    : the app itself (the expiry sweep, the Paystack webhook)
//   anonymous : nobody in particular (a visitor browsing the catalogue)
//
// The transport works out the actor (lib/api/auth.ts for the API,
// lib/services/session-actor.ts for pages and actions); the services only
// ever see this type, never cookies or headers.
import 'server-only'

import type { User } from '@/lib/rows'

export const API_SCOPES = ['catalog:read', 'catalog:write', 'orders:read', 'orders:write'] as const
export type ApiScope = (typeof API_SCOPES)[number]

export type ApiKeyPrincipal = {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
  isDemo: boolean
}

export type UserActor = { kind: 'user'; user: User }
export type ApiKeyActor = { kind: 'api_key'; key: ApiKeyPrincipal }
export type SystemActor = { kind: 'system'; label: 'Expiry sweep' | 'Paystack' | 'Demo cleanup' | 'Seed' }
export type AnonymousActor = { kind: 'anonymous' }

export type Actor = UserActor | ApiKeyActor | SystemActor | AnonymousActor

export const anonymous: AnonymousActor = { kind: 'anonymous' }

export function systemActor(label: SystemActor['label']): SystemActor {
  return { kind: 'system', label }
}

export function userActor(user: User): UserActor {
  return { kind: 'user', user }
}

/** True for staff and admin sessions, and for API keys: they act for the shop, not as a customer. */
export function isShopSide(actor: Actor): boolean {
  if (actor.kind === 'api_key' || actor.kind === 'system') return true
  return actor.kind === 'user' && (actor.user.role === 'staff' || actor.user.role === 'admin')
}

/** The signed-in CUSTOMER, or null (staff, keys and visitors have no cart). */
export function customerOf(actor: Actor): User | null {
  return actor.kind === 'user' && actor.user.role === 'customer' ? actor.user : null
}

/** Demo staff/admin see masked customer details (lib/services/privacy.ts). */
export function seesMaskedData(actor: Actor): boolean {
  return actor.kind === 'user' && actor.user.isDemo && actor.user.role !== 'customer'
}

/** Copied into order_events.actor_label: the timeline still reads right if the actor goes away. */
export function actorLabel(actor: Actor): string {
  switch (actor.kind) {
    case 'user':
      return `${actor.user.name} (${actor.user.role})`
    case 'api_key':
      return `API key "${actor.key.name}"`
    case 'system':
      return actor.label
    case 'anonymous':
      return 'Visitor'
  }
}

/** The ids stored with an order event. */
export function actorIds(actor: Actor): { userId: string | null; apiKeyId: string | null } {
  return {
    userId: actor.kind === 'user' ? actor.user.id : null,
    apiKeyId: actor.kind === 'api_key' ? actor.key.id : null,
  }
}

/** The owner string for idempotency keys and per-caller rate limits. */
export function actorOwner(actor: UserActor | ApiKeyActor): string {
  return actor.kind === 'user' ? `user:${actor.user.id}` : `key:${actor.key.id}`
}
