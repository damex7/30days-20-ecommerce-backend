import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ProductCard, ProductGridSkeleton } from '@/components/shop/product-card'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { isServiceError } from '@/lib/services/errors'
import { listCategories, listFacets, listProducts } from '@/lib/services/catalog'
import { getPageActor } from '@/lib/services/session-actor'
import { firstValues, shopHref, shopQuerySchema, type ShopQuery } from '@/lib/shop-query'

export const metadata: Metadata = { title: 'Shop' }

const SORT_LABELS = { newest: 'Newest first', price_asc: 'Price: low to high', price_desc: 'Price: high to low' } as const

export default function ProductsPage({ searchParams }: PageProps<'/products'>) {
  return (
    <>
      <PageHeader title="The workshop" description="Every piece is cut, stitched and finished by hand in Aba. Filter, search and sort; the address bar keeps your choices." />
      <Suspense fallback={<ProductGridSkeleton />}>
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Catalogue({ searchParams }: Pick<PageProps<'/products'>, 'searchParams'>) {
  const raw = firstValues(await searchParams)
  const query = shopQuerySchema.parse(raw)
  const actor = await getPageActor()

  const input = {
    category: query.category,
    q: query.q,
    size: query.size,
    colour: query.colour,
    minPriceKobo: query.min !== undefined ? query.min * 100 : undefined,
    maxPriceKobo: query.max !== undefined ? query.max * 100 : undefined,
    inStock: query.in_stock === '1' ? true : undefined,
    sort: query.sort,
    limit: 12,
  }
  let staleCursor = false
  let page
  try {
    page = await listProducts(actor, { ...input, cursor: query.cursor })
  } catch (error) {
    // A cursor from an old link (other filters, or edited by hand): start again from page one.
    if (!isServiceError(error) || error.kind !== 'bad_request') throw error
    staleCursor = true
    page = await listProducts(actor, input)
  }
  const [categories, facets] = await Promise.all([listCategories(), listFacets()])
  const filtered = Boolean(query.category || query.q || query.size || query.colour || query.min || query.max || query.in_stock)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_1fr]">
      <Filters query={query} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} sizes={facets.sizes} colours={facets.colours} />
      <section aria-labelledby="results-title" className="min-w-0">
        <h2 id="results-title" className="sr-only">
          Products
        </h2>
        {raw.notice === 'demo' ? (
          <Notice tone="success" title="Welcome to the demo shop" className="mb-4">
            <p>
              Your cart already has two things in it. <Link href="/cart">Open the cart</Link> to try a coupon (ABA10) and pay with the test card.
            </p>
          </Notice>
        ) : null}
        {staleCursor ? (
          <Notice tone="info" title="That page link had expired" className="mb-4">
            <p>Showing the first page of results instead.</p>
          </Notice>
        ) : null}
        {page.items.length === 0 ? (
          <EmptyState title={filtered ? 'Nothing matches those filters' : 'No products yet'}>
            {filtered ? <Link href="/products">Clear the filters</Link> : <p>The workshop is restocking.</p>}
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted" aria-live="polite">
              Showing {page.items.length} {page.items.length === 1 ? 'product' : 'products'}
              {query.cursor && !staleCursor ? ' (a later page)' : ''}, {SORT_LABELS[query.sort].toLowerCase()}.
            </p>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-3">
              {page.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {/* CURSOR PAGINATION: "next" carries the opaque cursor; there is no
                page 7 to jump to, by design (see lib/pagination.ts). */}
            <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-2">
              {query.cursor && !staleCursor ? (
                <Link href={shopHref(query, {})} className={button.secondary}>
                  <Icon name="arrowLeft" />
                  Back to the start
                </Link>
              ) : null}
              {page.nextCursor ? (
                <Link href={shopHref(query, { cursor: page.nextCursor })} className={button.primary}>
                  Next page
                  <Icon name="arrowRight" />
                </Link>
              ) : null}
            </nav>
          </>
        )}
      </section>
    </div>
  )
}

function Filters({ query, categories, sizes, colours }: { query: ShopQuery; categories: { slug: string; name: string }[]; sizes: string[]; colours: string[] }) {
  return (
    <aside aria-label="Filters" className="self-start">
      {/* A plain GET form: it works without JavaScript, and every choice
          ends up in the URL. Folds away on a phone. */}
      <details className="rounded-card border border-line bg-raised p-4 shadow-card" open>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between font-display text-xl font-bold">
          Filter and sort
          <Icon name="filter" className="lg:hidden" />
        </summary>
        <form action="/products" method="get" className="mt-3 space-y-4">
          <div>
            <label htmlFor="q" className="mb-1 block font-semibold">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={query.q} placeholder="tan loafer, tote…" className="field min-h-11 w-full px-3" />
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block font-semibold">
              Category
            </label>
            <select id="category" name="category" defaultValue={query.category ?? ''} className="field min-h-11 w-full px-2">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="size" className="mb-1 block font-semibold">
                Size
              </label>
              <select id="size" name="size" defaultValue={query.size ?? ''} className="field min-h-11 w-full px-2">
                <option value="">Any</option>
                {sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="colour" className="mb-1 block font-semibold">
                Colour
              </label>
              <select id="colour" name="colour" defaultValue={query.colour ?? ''} className="field min-h-11 w-full px-2">
                <option value="">Any</option>
                {colours.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="mb-1 font-semibold">Price (₦)</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted">From</span>
                <input name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={query.min} placeholder="0" className="field figures mt-0.5 min-h-11 w-full px-3" />
              </label>
              <label className="block text-sm">
                <span className="text-muted">To</span>
                <input name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={query.max} placeholder="Any" className="field figures mt-0.5 min-h-11 w-full px-3" />
              </label>
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2.5 font-semibold">
            <input type="checkbox" name="in_stock" value="1" defaultChecked={query.in_stock === '1'} className="size-5 accent-brand" />
            In stock only
          </label>
          <div>
            <label htmlFor="sort" className="mb-1 block font-semibold">
              Sort
            </label>
            <select id="sort" name="sort" defaultValue={query.sort} className="field min-h-11 w-full px-2">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${button.primary} flex-1`}>
              Show results
            </button>
            <Link href="/products" className={button.ghost}>
              Clear
            </Link>
          </div>
        </form>
      </details>
    </aside>
  )
}
