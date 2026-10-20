import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { StockNote } from '@/components/shop/price'
import { VariantPicker } from '@/components/shop/variant-picker'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { getProductBySlug } from '@/lib/services/catalog'
import { isServiceError } from '@/lib/services/errors'
import { anonymous } from '@/lib/services/actor'
import { getPageActor } from '@/lib/services/session-actor'

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  try {
    const product = await getProductBySlug(anonymous, slug)
    return { title: product.name, description: product.description.slice(0, 160) }
  } catch {
    return { title: 'Product' }
  }
}

export default function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <Product params={params} />
    </Suspense>
  )
}

async function Product({ params }: Pick<PageProps<'/products/[slug]'>, 'params'>) {
  const { slug } = await params
  const actor = await getPageActor()
  let product
  try {
    product = await getProductBySlug(actor, slug)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const [main, ...more] = product.images
  const totalStock = product.variants.reduce((n, v) => n + (v.status === 'active' ? v.stock : 0), 0)

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <Link href={`/products?category=${product.categorySlug}`} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-ink hover:underline">
          <Icon name="arrowLeft" className="size-4" />
          {product.categoryName}
        </Link>
        {main ? (
          <figure className="stitched overflow-hidden rounded-card border border-line bg-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={main.url} alt={main.alt} width={500} height={420} className="w-full" />
          </figure>
        ) : null}
        {more.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-3" aria-label="More pictures">
            {more.map((image) => (
              <li key={image.id} className="overflow-hidden rounded-control border border-line bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} width={500} height={420} loading="lazy" className="w-full" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <p className="stamp text-muted">{product.categoryName}</p>
        <h1 className="mt-1 text-4xl sm:text-5xl">{product.name}</h1>
        {product.status !== 'active' ? (
          <Notice tone="warning" title={`This product is ${product.status}`} className="mt-3">
            <p>Only staff can see it. Customers get “not found”.</p>
          </Notice>
        ) : null}
        <p className="mt-3 text-lg">{product.description}</p>
        <p className="mt-2">
          <StockNote stock={totalStock} />
        </p>
        <div className="mt-6 rounded-card border border-line bg-raised p-4 shadow-card sm:p-6">
          {product.variants.length > 0 ? (
            <VariantPicker
              slug={product.slug}
              variants={product.variants
                .filter((v) => v.status === 'active')
                .map((v) => ({ id: v.id, size: v.size, colour: v.colour, priceKobo: v.priceKobo, compareAtPriceKobo: v.compareAtPriceKobo, stock: v.stock }))}
            />
          ) : (
            <p className="text-muted">This piece isn’t on sale yet.</p>
          )}
        </div>
        <ul className="mt-5 space-y-1.5 text-sm text-muted">
          <li className="flex gap-2">
            <Icon name="truck" className="size-5 shrink-0" /> Delivered to every state; the fee for yours is shown at checkout.
          </li>
          <li className="flex gap-2">
            <Icon name="lock" className="size-5 shrink-0" /> Paid securely with Paystack. Your stock is held for 30 minutes while you pay.
          </li>
        </ul>
      </div>
    </article>
  )
}

function ProductSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading product" className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="skeleton aspect-[5/4] w-full rounded-card" />
      <div className="space-y-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-64 w-full rounded-card" />
      </div>
    </div>
  )
}
