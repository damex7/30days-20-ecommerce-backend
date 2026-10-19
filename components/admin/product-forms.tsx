'use client'

import { useActionState } from 'react'
import { saveImage, saveProduct, saveVariant, type VariantField } from '@/app/(shop)/admin/products/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { FieldError, NairaField, SelectField, TextAreaField, TextField, describedBy } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

function Status({ state }: { state: FormState }) {
  return (
    <p role="status" className={`text-sm font-semibold empty:sr-only ${state.status === 'error' ? 'text-danger' : 'text-success'}`}>
      {state.status === 'success' ? state.message : ''}
    </p>
  )
}

type ProductDefaults = { id?: number; version?: number; name?: string; slug?: string; description?: string; categoryId?: number; status?: string }

export function ProductForm({ product = {}, categories, readOnly, readOnlyId }: { product?: ProductDefaults; categories: { id: number; name: string }[]; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(saveProduct, { status: 'idle' } satisfies FormState<'name' | 'slug' | 'description' | 'category_id' | 'status'>)
  const v = (k: 'name' | 'slug' | 'description' | 'category_id' | 'status', fallback: string) => state.values?.[k] ?? fallback
  return (
    <form action={action} noValidate className="space-y-4">
      <ErrorSummary state={state} labels={{ name: 'Name', slug: 'Slug', description: 'Description', category_id: 'Category', status: 'Status', version: 'Version' }} />
      {product.id ? (
        <>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="version" value={product.version} />
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" defaultValue={v('name', product.name ?? '')} errors={state.fieldErrors?.name} maxLength={120} required />
        <TextField name="slug" label="Slug (in the URL)" hint="Leave empty to make one from the name." defaultValue={v('slug', product.slug ?? '')} errors={state.fieldErrors?.slug} className="[&_input]:font-mono" maxLength={80} />
      </div>
      <TextAreaField name="description" label="Description" rows={4} defaultValue={v('description', product.description ?? '')} errors={state.fieldErrors?.description} maxLength={5000} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="category_id" label="Category" defaultValue={v('category_id', String(product.categoryId ?? ''))} errors={state.fieldErrors?.category_id}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField name="status" label="Status" hint="Draft: staff only. Archived: off sale, kept for order history." defaultValue={v('status', product.status ?? 'draft')} errors={state.fieldErrors?.status}>
          <option value="draft">Draft</option>
          <option value="active">Active (on sale)</option>
          <option value="archived">Archived</option>
        </SelectField>
      </div>
      <SubmitButton pendingLabel="Saving…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        {product.id ? 'Save product' : 'Create product'}
      </SubmitButton>
      <Status state={state} />
    </form>
  )
}

export type VariantDefaults = { id: number; version: number; sku: string; size: string; colour: string; price: string; compareAt: string; stock: number; status: string }

/**
 * One variant as a compact form row. The field ids are prefixed with the
 * variant id, so many rows can share the page without clashing.
 */
export function VariantRow({ variant, readOnly, readOnlyId }: { variant: VariantDefaults; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(saveVariant, { status: 'idle' } satisfies FormState)
  const p = `v${variant.id}`
  const err = (name: VariantField) => state.fieldErrors?.[name]
  const input = (name: Exclude<VariantField, 'price_kobo' | 'compare_at_price_kobo'>, label: string, defaultValue: string | number, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`${p}-${name}`} className="mb-0.5 block text-xs font-semibold text-muted">
        {label}
      </label>
      <input
        id={`${p}-${name}`}
        name={name}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={err(name)?.length ? true : undefined}
        aria-describedby={describedBy(`${p}-${name}`, false, Boolean(err(name)?.length))}
        className="field min-h-10 w-full px-2 text-sm"
        {...extra}
      />
      <FieldError name={`${p}-${name}`} errors={err(name)} />
    </div>
  )
  return (
    <form action={action} className="grid grid-cols-2 items-start gap-2 py-3 sm:grid-cols-[1.4fr_0.7fr_0.9fr_1fr_1fr_0.7fr_1fr_auto]">
      <input type="hidden" name="variant_id" value={variant.id} />
      <input type="hidden" name="version" value={variant.version} />
      {input('sku', 'SKU', variant.sku, { className: 'field min-h-10 w-full px-2 font-mono text-xs uppercase' })}
      {input('size', 'Size', variant.size)}
      {input('colour', 'Colour', variant.colour)}
      {input('price', 'Price ₦', variant.price, { inputMode: 'decimal', className: 'field figures min-h-10 w-full px-2 text-sm' })}
      {input('compare_at', 'Was ₦ (sale)', variant.compareAt, { inputMode: 'decimal', placeholder: '—', className: 'field figures min-h-10 w-full px-2 text-sm' })}
      {input('stock', 'Stock', variant.stock, { inputMode: 'numeric', className: 'field figures min-h-10 w-full px-2 text-sm' })}
      <div>
        <label htmlFor={`${p}-status`} className="mb-0.5 block text-xs font-semibold text-muted">
          Status
        </label>
        <select id={`${p}-status`} name="status" defaultValue={variant.status} className="field min-h-10 w-full px-1 text-sm">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="flex flex-col items-start gap-1 sm:pt-4">
        <SubmitButton variant="small" pendingLabel="…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
          Save<span className="sr-only"> {variant.sku}</span>
        </SubmitButton>
      </div>
      <div className="col-span-full">
        {state.status === 'error' ? <p className="text-sm font-semibold text-danger">{state.message}</p> : null}
        <Status state={state} />
      </div>
    </form>
  )
}

export function NewVariantForm({ productId, readOnly, readOnlyId }: { productId: number; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(saveVariant, { status: 'idle' } satisfies FormState)
  const e = (k: VariantField) => state.fieldErrors?.[k]
  return (
    <form action={action} noValidate className="space-y-3" key={state.status === 'success' ? state.submissionId : 'new'}>
      <ErrorSummary state={state} labels={{ sku: 'SKU', size: 'Size', colour: 'Colour', price: 'Price', price_kobo: 'Price', compare_at: 'Was price', compare_at_price_kobo: 'Was price', stock: 'Stock' }} />
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="sku" label="SKU" hint="e.g. ONA-44-TAN" defaultValue={state.values?.sku} errors={e('sku')} className="[&_input]:font-mono [&_input]:uppercase" />
        <TextField name="size" label="Size" defaultValue={state.values?.size} errors={e('size')} />
        <TextField name="colour" label="Colour" defaultValue={state.values?.colour} errors={e('colour')} />
        <NairaField name="price" label="Price" defaultValue={state.values?.price} errors={e('price') ?? e('price_kobo')} />
        <NairaField name="compare_at" label="Was (optional)" hint="Shown struck through" defaultValue={state.values?.compare_at} errors={e('compare_at') ?? e('compare_at_price_kobo')} />
        <TextField name="stock" label="Stock" inputMode="numeric" defaultValue={state.values?.stock ?? '0'} errors={e('stock')} />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Adding…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Add variant
      </SubmitButton>
      <Status state={state} />
    </form>
  )
}

export function ImageForm({ productId, readOnly, readOnlyId }: { productId: number; readOnly: boolean; readOnlyId: string }) {
  const [state, action] = useActionState(saveImage, { status: 'idle' } satisfies FormState<'url' | 'alt'>)
  return (
    <form action={action} noValidate className="space-y-3" key={state.status === 'success' ? state.submissionId : 'img'}>
      <ErrorSummary state={state} labels={{ url: 'Image path', alt: 'Description' }} />
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="url" label="Image path" hint="A file in /public, e.g. /products/bag-tan.svg" defaultValue={state.values?.url} errors={state.fieldErrors?.url} className="[&_input]:font-mono" />
        <TextField name="alt" label="Description for screen readers" hint="What the picture shows" defaultValue={state.values?.alt} errors={state.fieldErrors?.alt} />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Adding…" disabled={readOnly} describedBy={readOnly ? readOnlyId : undefined}>
        Add image
      </SubmitButton>
      <Status state={state} />
    </form>
  )
}
