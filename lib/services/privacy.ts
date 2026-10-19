// MASKING for the read-only demo staff and admin views.
//
// Portfolio visitors exploring /admin see real-looking orders, but never
// a real person's contact details: emails become a***@g***.com, phone
// numbers 0803****567, and street addresses are hidden (city and state
// stay, so the delivery-fee logic still makes sense). The SERVICES apply
// this before returning data, so the API and the admin pages can't forget.
import 'server-only'

import { seesMaskedData, type Actor } from './actor'

/** ada.obi@gmail.com → a***@g***.com */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  const dot = domain.lastIndexOf('.')
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`
}

/** +2348031234567 → 0803****567 */
export function maskPhone(e164: string): string {
  const national = e164.startsWith('+234') ? `0${e164.slice(4)}` : e164
  return `${national.slice(0, 4)}****${national.slice(-3)}`
}

export const HIDDEN = 'Hidden in the demo'

/** Applies the masks only when the viewer is demo staff/admin. */
export function forViewer<T>(actor: Actor, value: T, mask: (v: T) => T): T {
  return seesMaskedData(actor) ? mask(value) : value
}
