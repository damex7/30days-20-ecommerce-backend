// COUPONS: the rules, each with a reason a customer can act on.
//
// evaluateCoupon() is PURE (no database): given a coupon, a subtotal, how
// often this customer has used it and the time, it says yes (with the
// discount) or no (with the reason). The cart page calls it to explain;
// checkout calls it again inside its transaction and then CLAIMS the use
// with a guarded UPDATE (lib/repos/coupons.ts), because the last use can
// be taken by someone else between the two.
import 'server-only'

import { http, type Db } from '@/lib/db/executor'
import { isUniqueError } from '@/lib/db/errors'
import { formatNaira } from '@/lib/money'
import { decodeCursor, encodeCursor, toPage, type Page } from '@/lib/pagination'
import * as repo from '@/lib/repos/coupons'
import type { CouponInput, CouponRow } from '@/lib/repos/coupons'
import type { Actor } from './actor'
import { conflict, invalid, notFound, staleVersion } from './errors'
import { authorize } from './permissions'
import { couponDiscount } from './pricing'

export type CouponProblem = 'unknown' | 'inactive' | 'not_started' | 'expired' | 'used_up' | 'minimum_not_met' | 'customer_limit'

export type CouponCheck =
  | { ok: true; discountKobo: number }
  | { ok: false; problem: CouponProblem; message: string }

const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })

export function evaluateCoupon(coupon: CouponRow, input: { subtotalKobo: number; customerUses: number; now: Date }): CouponCheck {
  if (!coupon.active) return { ok: false, problem: 'inactive', message: `The code ${coupon.code} isn’t active at the moment.` }
  if (coupon.startsAt && coupon.startsAt > input.now) {
    return { ok: false, problem: 'not_started', message: `The code ${coupon.code} starts on ${DATE.format(coupon.startsAt)}.` }
  }
  if (coupon.endsAt && coupon.endsAt <= input.now) {
    return { ok: false, problem: 'expired', message: `The code ${coupon.code} expired on ${DATE.format(coupon.endsAt)}.` }
  }
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
    return { ok: false, problem: 'used_up', message: `The code ${coupon.code} has been used the maximum number of times.` }
  }
  if (coupon.perCustomerLimit !== null && input.customerUses >= coupon.perCustomerLimit) {
    const times = coupon.perCustomerLimit === 1 ? 'once' : `${coupon.perCustomerLimit} times`
    return { ok: false, problem: 'customer_limit', message: `You’ve already used ${coupon.code}. It can be used ${times} per customer.` }
  }
  if (input.subtotalKobo < coupon.minOrderKobo) {
    const short = coupon.minOrderKobo - input.subtotalKobo
    return {
      ok: false,
      problem: 'minimum_not_met',
      message: `${coupon.code} needs a subtotal of at least ${formatNaira(coupon.minOrderKobo)} before delivery. Add ${formatNaira(short)} more to use it.`,
    }
  }
  return { ok: true, discountKobo: couponDiscount(coupon, input.subtotalKobo) }
}

/** Looks a code up and checks it for this customer and subtotal. */
export async function checkCode(db: Db, code: string, customerId: string, subtotalKobo: number): Promise<{ coupon: CouponRow | null; check: CouponCheck }> {
  const coupon = await repo.findCouponByCode(db, code)
  if (!coupon) return { coupon: null, check: { ok: false, problem: 'unknown', message: `We don’t recognise the code ${code}. Check the spelling.` } }
  const customerUses = await repo.countRedemptions(db, coupon.id, customerId)
  return { coupon, check: evaluateCoupon(coupon, { subtotalKobo, customerUses, now: new Date() }) }
}

/** For the admin list: one word for where a coupon stands today. */
export function couponState(coupon: CouponRow, now = new Date()): 'active' | 'scheduled' | 'expired' | 'used_up' | 'paused' {
  if (!coupon.active) return 'paused'
  if (coupon.endsAt && coupon.endsAt <= now) return 'expired'
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return 'used_up'
  if (coupon.startsAt && coupon.startsAt > now) return 'scheduled'
  return 'active'
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listCoupons(actor: Actor, input: { cursor?: string; limit: number }): Promise<Page<CouponRow>> {
  authorize(actor, 'coupons.read')
  const key = input.cursor ? decodeCursor(input.cursor, 'coupons', {}) : null
  const after = key ? { ts: String(key[0]), id: Number(key[1]) } : undefined
  const result = await repo.listCoupons(http, after, input.limit)
  return toPage(result, input.limit, (last) => encodeCursor('coupons', {}, [last.cursorTs, last.id]))
}

export async function getCoupon(actor: Actor, id: number): Promise<CouponRow> {
  authorize(actor, 'coupons.read')
  const coupon = await repo.findCouponById(http, id)
  if (!coupon) throw notFound('Coupon')
  return coupon
}

function codeTaken(code: string) {
  return conflict('code_taken', `There is already a coupon with the code ${code}. Codes ignore capital letters.`)
}

export async function createCoupon(actor: Actor, input: CouponInput): Promise<CouponRow> {
  authorize(actor, 'coupons.manage')
  checkWindow(input.startsAt, input.endsAt)
  try {
    const coupon = await repo.insertCoupon(http, input)
    if (!coupon) throw new Error('insertCoupon returned nothing')
    return coupon
  } catch (error) {
    if (isUniqueError(error)) throw codeTaken(input.code)
    throw error
  }
}

export async function updateCoupon(actor: Actor, id: number, version: number, patch: Partial<CouponInput>): Promise<CouponRow> {
  authorize(actor, 'coupons.manage')
  const current = await repo.findCouponById(http, id)
  if (!current) throw notFound('Coupon')
  checkWindow(patch.startsAt !== undefined ? patch.startsAt : current.startsAt, patch.endsAt !== undefined ? patch.endsAt : current.endsAt)
  const kind = patch.kind ?? current.kind
  const value = patch.value ?? current.value
  if (kind === 'percent' && (value < 1 || value > 100)) throw invalid('validation_failed', 'A percentage coupon takes off between 1 and 100%.', [{ field: 'value', message: 'Use a whole number from 1 to 100.' }])
  if (patch.maxUses !== undefined && patch.maxUses !== null && patch.maxUses < current.uses) {
    throw invalid('validation_failed', 'That limit is below the uses already made.', [{ field: 'max_uses', message: `It has already been used ${current.uses} times.` }])
  }
  try {
    const coupon = await repo.updateCoupon(http, id, version, patch)
    if (!coupon) throw staleVersion('coupon', current.version)
    return coupon
  } catch (error) {
    if (isUniqueError(error) && patch.code) throw codeTaken(patch.code)
    throw error
  }
}

function checkWindow(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw invalid('validation_failed', 'The end must be after the start.', [{ field: 'ends_at', message: 'Pick an end date after the start date.' }])
  }
}
