// MONEY: integer kobo everywhere, Naira only on screen.
//
// ₦1 = 100 kobo. The database stores bigint kobo (product_variants.price_kobo,
// orders.total_kobo and the rest), the
// code passes whole numbers of kobo around, and only these two functions
// turn them into or out of Naira text. No floats are ever used for money:
// in binary floating point 0.1 + 0.2 = 0.30000000000000004, and a day's
// takings add up many prices.
//
// Why `number` and not `bigint` in TypeScript? A JavaScript number holds
// every whole number exactly up to 2^53 (9,007,199,254,740,991 kobo, about
// ₦90 trillion), so whole kobo never lose precision. Every amount that
// enters (form input, database row) is checked with Number.isSafeInteger.
// Not server-only: forms use these too.

const NAIRA = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Splits whole kobo into "1250.50" WITHOUT dividing (BigInt keeps it exact). */
function koboToDecimalString(kobo: number): string {
  const value = BigInt(kobo)
  const negative = value < 0n
  const abs = negative ? -value : value
  const naira = abs / 100n
  const rest = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${naira}.${rest}`
}

/**
 * 125050 → "₦1,250.50".
 * Intl.NumberFormat.format accepts a decimal STRING and formats it exactly
 * (no conversion to a float on the way), so the kobo are never rounded.
 */
export function formatNaira(kobo: number): string {
  // format() accepts a decimal string since ES2023 (Intl.NumberFormat v3);
  // TypeScript's lib types still only list number | bigint.
  return NAIRA.format(koboToDecimalString(kobo) as unknown as number)
}

/** 125050 → "1250.50", the value an edit form starts with. */
export function koboToInput(kobo: number): string {
  return koboToDecimalString(kobo)
}

/** The largest price accepted from a form: ₦1 billion. */
export const MAX_PRICE_KOBO = 100_000_000_000

/**
 * "₦1,250.5", "1250.50", " 1 250 " → 125050 kobo, or null if it isn't a
 * valid amount. Parsed as TEXT: the Naira and kobo parts are read as two
 * whole numbers, so "0.1" becomes exactly 10 kobo (parseFloat(x) * 100
 * would give 10.000000000000002 for some inputs).
 */
export function parseNaira(input: string): number | null {
  const cleaned = input.trim().replace(/^(₦|NGN|N)\s*/i, '').replace(/[,\s]/g, '')
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const [, whole = '0', fraction = ''] = match
  const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  if (kobo > BigInt(MAX_PRICE_KOBO)) return null
  return Number(kobo)
}

