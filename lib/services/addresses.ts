// ADDRESSES (a customer's own) and DELIVERY FEES (public to read, admin to change).
import 'server-only'

import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import * as repo from '@/lib/repos/addresses'
import type { AddressInput, AddressRow, DeliveryFeeRow } from '@/lib/repos/addresses'
import { customerOf, type Actor } from './actor'
import { conflict, invalid, notFound, staleVersion } from './errors'
import { authorize } from './permissions'

/** authorize() has checked the role; this narrows the type to the customer. */
function customerId(actor: Actor): string {
  const customer = customerOf(actor)
  if (!customer) throw new Error('addresses: authorize() should have refused a non-customer')
  return customer.id
}

async function checkState(state: string | undefined) {
  if (state === undefined) return
  if (!(await repo.findDeliveryFee(http, state))) {
    throw invalid('unknown_state', 'We don’t deliver to that state.', [{ field: 'state', message: 'Choose one of the 36 states or the FCT.' }])
  }
}

export async function listAddresses(actor: Actor): Promise<AddressRow[]> {
  authorize(actor, 'addresses.own')
  return repo.listAddresses(http, customerId(actor))
}

/** Someone else's address id is a 404, the same as one that doesn't exist. */
export async function getAddress(actor: Actor, id: number): Promise<AddressRow> {
  authorize(actor, 'addresses.own')
  const address = await repo.findAddress(http, customerId(actor), id)
  if (!address) throw notFound('Address')
  return address
}

export async function createAddress(actor: Actor, input: AddressInput): Promise<AddressRow> {
  authorize(actor, 'addresses.own')
  const owner = customerId(actor)
  await checkState(input.state)
  if ((await repo.countAddresses(http, owner)) >= repo.MAX_ADDRESSES) {
    throw conflict('too_many_addresses', `You can save up to ${repo.MAX_ADDRESSES} addresses. Delete one you no longer use first.`)
  }
  return withTransaction((tx) => repo.insertAddress(tx, owner, input))
}

export async function updateAddress(actor: Actor, id: number, version: number, patch: Partial<AddressInput>): Promise<AddressRow> {
  authorize(actor, 'addresses.own')
  const owner = customerId(actor)
  await checkState(patch.state)
  if (patch.isDefault === false) {
    throw invalid('validation_failed', 'Choose another address as the default instead.', [{ field: 'is_default', message: 'Make a different address the default; there must always be one.' }])
  }
  const updated = await withTransaction((tx) => repo.updateAddress(tx, owner, id, version, patch))
  if (updated) return updated
  const current = await repo.findAddress(http, owner, id)
  if (!current) throw notFound('Address')
  throw staleVersion('address', current.version)
}

export async function deleteAddress(actor: Actor, id: number): Promise<void> {
  authorize(actor, 'addresses.own')
  const owner = customerId(actor)
  const deleted = await withTransaction((tx) => repo.deleteAddress(tx, owner, id))
  if (!deleted) throw notFound('Address')
}

// ---------------------------------------------------------------------------
// Delivery fees
// ---------------------------------------------------------------------------

/** Public: the checkout page and any client can show what delivery costs where. */
export function listDeliveryFees(): Promise<DeliveryFeeRow[]> {
  return repo.listDeliveryFees(http)
}

export async function updateDeliveryFee(
  actor: Actor,
  state: string,
  version: number,
  patch: { feeKobo?: number; minDays?: number; maxDays?: number },
): Promise<DeliveryFeeRow> {
  authorize(actor, 'delivery_fees.manage')
  const current = await repo.findDeliveryFee(http, state)
  if (!current) throw notFound('Delivery fee')
  const minDays = patch.minDays ?? current.minDays
  const maxDays = patch.maxDays ?? current.maxDays
  if (maxDays < minDays) {
    throw invalid('validation_failed', 'The longest delivery time can’t be shorter than the quickest.', [{ field: 'max_days', message: `Use ${minDays} days or more.` }])
  }
  const updated = await repo.updateDeliveryFee(http, state, version, patch)
  if (!updated) throw staleVersion('delivery fee', current.version)
  return updated
}
