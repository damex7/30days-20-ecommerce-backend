// NIGERIAN MOBILE NUMBERS. People write the same number many ways:
// "0803 123 4567", "08031234567", "+234 803 123 4567", "234-803-123-4567".
// We accept all of them, but STORE one: E.164, "+2348031234567". One stored
// form means the CHECKs in db/migrations/006 and 008 can verify it, two customers with
// the same number are easy to spot, and wa.me links just work.
//
// Nigerian mobile numbers are 11 digits starting 070, 080, 081, 090 or 091
// (0 + 10 digits); internationally, +234 replaces the leading 0.
// Not server-only: the sign-up and address forms show the same rules.

const NATIONAL = /^0([789][01]\d{8})$/
const INTERNATIONAL = /^(?:\+?234)([789][01]\d{8})$/

/** Any common way of writing a Nigerian mobile → "+2348031234567", or null. */
export function normalizeNigerianPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '')
  const match = NATIONAL.exec(compact) ?? INTERNATIONAL.exec(compact)
  return match?.[1] ? `+234${match[1]}` : null
}

/** "+2348031234567" → "0803 123 4567", the way it's usually read out. */
export function formatPhone(e164: string): string {
  const national = `0${e164.slice(4)}`
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`
}

/** "+2348031234567" → "2348031234567", the form wa.me links need. */
export function whatsappNumber(e164: string): string {
  return e164.replace(/^\+/, '')
}

/**
 * A "Chat on WhatsApp" link: https://wa.me/<number>?text=<message>. The
 * message is pre-filled in the chat box; the person still presses Send, so
 * nothing is sent on their behalf.
 */
export function whatsappLink(e164: string, message?: string): string {
  const base = `https://wa.me/${whatsappNumber(e164)}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
