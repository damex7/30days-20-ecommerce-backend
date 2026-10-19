// DATES ON SCREEN, always in Lagos time (the shop is in Aba; every customer
// is in Nigeria, which has one time zone and no daylight saving). The
// database stores instants (timestamptz); only display converts.

const ZONE = 'Africa/Lagos'

const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE })
const STAMP = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ZONE })
const SHORT = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: ZONE })

/** "19 Oct 2026" */
export function formatDate(date: Date): string {
  return DATE.format(date)
}

/** "19 Oct 2026, 3:42 pm" */
export function formatStamp(date: Date, _timeZone?: string): string {
  return STAMP.format(date)
}

/** "19 Oct, 3:42 pm" */
export function formatShort(date: Date): string {
  return SHORT.format(date)
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "3 minutes ago", "in 25 minutes", "yesterday". */
export function fromNow(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return RELATIVE.format(seconds, 'second')
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), 'hour')
  return RELATIVE.format(Math.round(seconds / 86_400), 'day')
}
