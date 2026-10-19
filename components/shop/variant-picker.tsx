'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { addToCart } from '@/app/(shop)/products/[slug]/actions'
import { SubmitButton } from '@/components/forms/submit-button'
import { Icon } from '@/components/ui/icon'
import { formatNaira } from '@/lib/money'
import type { FormState } from '@/lib/validation'
import { Price, StockNote } from './price'

export type PickerVariant = { id: number; size: string; colour: string; priceKobo: number; compareAtPriceKobo: number | null; stock: number }

/**
 * CHOOSING A SIZE AND COLOUR, as two real RADIO GROUPS (<fieldset> +
 * <input type="radio">): arrow keys move within a group, the browser and
 * screen readers know exactly what they are, and it works with any input.
 *
 * A size that doesn't exist in the chosen colour, or is sold out, stays in
 * the list but DISABLED, with the reason written next to it ("sold out in
 * tan"), so nobody wonders why they can't pick it.
 */
export function VariantPicker({ slug, variants }: { slug: string; variants: PickerVariant[] }) {
  const colours = [...new Set(variants.map((v) => v.colour))]
  const sizes = [...new Set(variants.map((v) => v.size))]
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0]
  const [colour, setColour] = useState(firstAvailable?.colour ?? colours[0] ?? '')
  const [size, setSize] = useState<string | null>(firstAvailable?.size ?? null)
  const [state, action] = useActionState(addToCart, { status: 'idle' } satisfies FormState)
  const ids = useId()

  const variantFor = (s: string, c: string) => variants.find((v) => v.size === s && v.colour === c)
  const chosen = size ? variantFor(size, colour) : undefined
  const canBuy = chosen !== undefined && chosen.stock > 0

  function chooseColour(next: string) {
    setColour(next)
    // Keep the size if it exists in the new colour; otherwise clear it.
    if (size && !(variantFor(size, next)?.stock ?? 0)) setSize(null)
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="variant_id" value={chosen?.id ?? ''} />

      <fieldset>
        <legend className="mb-2 font-bold">
          Colour: <span className="font-normal">{colour}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {colours.map((c) => {
            const anyStock = variants.some((v) => v.colour === c && v.stock > 0)
            return (
              <label key={c} className="cursor-pointer rounded-control border border-line-strong bg-raised px-3.5 py-2 font-semibold has-checked:border-2 has-checked:border-brand has-checked:bg-tint has-focus-visible:outline-3 has-focus-visible:outline-focus">
                <input type="radio" name="colour" value={c} checked={colour === c} onChange={() => chooseColour(c)} className="sr-only" />
                {c}
                {!anyStock ? <span className="ml-1 text-sm font-normal text-muted">(sold out)</span> : null}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset aria-describedby={`${ids}-size-hint`}>
        <legend className="mb-2 font-bold">
          Size: <span className="font-normal">{size ?? 'choose one'}</span>
        </legend>
        <p id={`${ids}-size-hint`} className="-mt-1 mb-2 text-sm text-muted">
          Greyed-out sizes aren’t available in {colour.toLowerCase()}.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {sizes.map((s) => {
            const v = variantFor(s, colour)
            const reason = !v ? `not made in ${colour.toLowerCase()}` : v.stock === 0 ? 'sold out' : null
            return (
              <label
                key={s}
                className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-control border border-line-strong bg-raised px-2 py-1 text-center has-checked:border-2 has-checked:border-brand has-checked:bg-tint has-disabled:cursor-not-allowed has-disabled:border-dashed has-disabled:bg-sunken has-disabled:text-muted has-focus-visible:outline-3 has-focus-visible:outline-focus"
              >
                <input type="radio" name="size" value={s} checked={size === s} disabled={reason !== null} onChange={() => setSize(s)} className="sr-only" />
                <span className="figures font-bold">{s}</span>
                {reason ? <span className="text-[0.7rem] leading-tight">{reason}</span> : null}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4 border-t border-dashed border-line pt-4">
        <div className="min-w-0 flex-1">
          {chosen ? (
            <>
              <Price kobo={chosen.priceKobo} compareAt={chosen.compareAtPriceKobo} className="text-2xl" />
              <p className="mt-1 text-sm">
                <StockNote stock={chosen.stock} />
                {chosen.stock > 3 ? <span className="text-muted">In stock, ready to ship from Aba</span> : null}
              </p>
            </>
          ) : (
            <p className="text-muted">Choose a size to see the price ({formatNaira(Math.min(...variants.map((v) => v.priceKobo)))} and up).</p>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-qty`} className="mb-1 block text-sm font-semibold">
            Quantity
          </label>
          <select id={`${ids}-qty`} name="quantity" className="field figures min-h-12 w-20 px-2" defaultValue="1">
            {Array.from({ length: Math.max(1, Math.min(chosen?.stock ?? 1, 10)) }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
      </div>

      <SubmitButton className="w-full" disabled={!canBuy} pendingLabel="Adding…">
        <Icon name="cart" />
        Add to cart
      </SubmitButton>

      {/* aria-live: the result is read out without moving focus. */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {state.status === 'success' ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border-l-4 border-success bg-success-soft p-3 font-semibold text-success">
            <span>
              <Icon name="checkCircle" className="mr-1 inline" />
              {state.message}
            </span>
            <Link href="/cart" className="link">
              View cart
            </Link>
          </p>
        ) : state.status === 'error' ? (
          <p className="rounded-control border-l-4 border-danger bg-danger-soft p-3 font-semibold text-danger">{state.message}</p>
        ) : null}
      </div>
    </form>
  )
}
