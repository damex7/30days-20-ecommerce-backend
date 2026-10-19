import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ImageForm, NewVariantForm, ProductForm, VariantRow } from '@/components/admin/product-forms'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { koboToInput } from '@/lib/money'
import { getProductById, listCategories } from '@/lib/services/catalog'
import { isServiceError } from '@/lib/services/errors'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireShopActor } from '@/lib/services/session-actor'
import { archiveProduct, removeImage, removeProduct, removeVariant } from '../actions'

export const metadata: Metadata = { title: 'Edit product' }

const NOTICES: Record<string, string> = {
  created: 'Product created as a draft. Add its sizes and colours below, then set it to Active.',
  archived: 'Archived: it’s off the shop, and its order history is intact.',
}

export default function EditProductPage({ params, searchParams }: PageProps<'/admin/products/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditProduct params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function EditProduct({ params, searchParams }: Pick<PageProps<'/admin/products/[id]'>, 'params' | 'searchParams'>) {
  const actor = await requireShopActor()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const productId = Number(id)
  if (!Number.isSafeInteger(productId) || productId < 1) notFound()
  let product
  try {
    product = await getProductById(actor, productId)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const categories = await listCategories()
  const readOnly = isReadOnlyDemo(actor)
  const notice = typeof query.notice === 'string' ? NOTICES[query.notice] : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/admin/products', label: 'Products' }}
        title={product.name}
        description={
          <>
            <span className="stamp mr-2">{product.status}</span>
            {product.status === 'active' ? (
              <Link href={`/products/${product.slug}`} className="link">
                View in the shop
              </Link>
            ) : null}
          </>
        }
      />
      {notice ? (
        <Notice tone="success" title={notice} live />
      ) : null}
      <ReadOnlyNote show={readOnly} />

      <section aria-labelledby="details-title" className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="details-title" className="mb-4 text-2xl">
          Details
        </h2>
        <ProductForm
          product={{ id: product.id, version: product.version, name: product.name, slug: product.slug, description: product.description, categoryId: product.categoryId, status: product.status }}
          categories={categories}
          readOnly={readOnly}
          readOnlyId={READ_ONLY_NOTE_ID}
        />
      </section>

      <section aria-labelledby="variants-title" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="variants-title" className="text-2xl">
          Sizes, colours and stock
        </h2>
        <p className="mt-1 text-sm text-muted">Each variant has its own SKU, price and stock. Prices in Naira; a “was” price puts it on sale.</p>
        <div className="mt-2 divide-y divide-dashed divide-line">
          {product.variants.map((v) => (
            <div key={v.id}>
              <VariantRow
                variant={{ id: v.id, version: v.version, sku: v.sku, size: v.size, colour: v.colour, price: koboToInput(v.priceKobo), compareAt: v.compareAtPriceKobo !== null ? koboToInput(v.compareAtPriceKobo) : '', stock: v.stock, status: v.status }}
                readOnly={readOnly}
                readOnlyId={READ_ONLY_NOTE_ID}
              />
              {!readOnly ? (
                <div className="pb-3">
                  <ConfirmAction
                    action={removeVariant}
                    fields={{ variant_id: String(v.id) }}
                    trigger={`Delete ${v.sku}`}
                    icon="trash"
                    title={`Delete ${v.sku}?`}
                    body={<p>Only possible if it has never been ordered. A variant that has been sold can be archived instead (Status: Archived).</p>}
                    confirmLabel="Delete variant"
                    danger
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <details className="mt-4 rounded-control border border-dashed border-line-strong p-3" open={product.variants.length === 0}>
          <summary className="min-h-9 cursor-pointer content-center font-semibold">Add a variant</summary>
          <div className="mt-3">
            <NewVariantForm productId={product.id} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
          </div>
        </details>
      </section>

      <section aria-labelledby="images-title" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="images-title" className="text-2xl">
          Images
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {product.images.map((image) => (
            <li key={image.id} className="rounded-control border border-line bg-paper p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt} width={250} height={210} className="w-full rounded-control" />
              <p className="mt-1 text-xs text-muted">{image.alt}</p>
              {!readOnly ? (
                <ConfirmAction action={removeImage} fields={{ image_id: String(image.id) }} trigger="Remove" icon="trash" title="Remove this image?" body={<p>The file stays in /public; only the link to this product is removed.</p>} confirmLabel="Remove image" danger />
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <ImageForm productId={product.id} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
        </div>
      </section>

      {!readOnly ? (
        <section aria-labelledby="danger-title" className="max-w-3xl rounded-card border border-danger bg-raised p-5 sm:p-7">
          <h2 id="danger-title" className="text-2xl">
            Remove this product
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">Products that have been ordered can’t be deleted (orders point at their variants); you’ll be offered Archive instead.</p>
          <ConfirmAction
            action={removeProduct}
            archiveAction={archiveProduct}
            fields={{ id: String(product.id), version: String(product.version) }}
            trigger="Delete product"
            triggerVariant="dangerOutline"
            icon="trash"
            title={`Delete ${product.name}?`}
            body={<p>This can’t be undone. Its variants and images are deleted with it.</p>}
            confirmLabel="Delete for good"
            danger
          />
        </section>
      ) : null}
    </div>
  )
}
