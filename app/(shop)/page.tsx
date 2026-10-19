import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Mark } from '@/components/brand/mark'
import { ProductCard, ProductGridSkeleton } from '@/components/shop/product-card'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { anonymous } from '@/lib/services/actor'
import { listCategories, listProducts } from '@/lib/services/catalog'

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="stitched relative overflow-hidden rounded-card border border-line bg-raised px-6 py-10 shadow-card sm:px-10 sm:py-14">
        <div className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="stamp text-muted">Ariaria Market · Aba · since 2019</p>
            <h1 className="mt-3 text-5xl sm:text-6xl">
              Leather, cut and <span className="text-brand">stitched in Aba.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Shoes, bags, belts and sandals from the workshops of Ariaria market, delivered to all 36 states and the FCT. Prices in Naira, paid
              securely with Paystack.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/products" className={button.large}>
                Shop the workshop
              </Link>
              <Link href="/docs" className={button.largeSecondary}>
                <Icon name="code" />
                Use the API
              </Link>
            </div>
          </div>
          <Mark className="mx-auto size-48 text-brand max-md:hidden" />
        </div>
      </section>

      <section aria-labelledby="categories-title">
        <h2 id="categories-title" className="mb-4 text-3xl">
          From the bench
        </h2>
        <Suspense fallback={<div className="skeleton h-24 w-full rounded-card" />}>
          <Categories />
        </Suspense>
      </section>

      <section aria-labelledby="new-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="new-title" className="text-3xl">
            Just off the last
          </h2>
          <Link href="/products" className="link">
            See everything
          </Link>
        </div>
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <Newest />
        </Suspense>
      </section>
    </div>
  )
}

// Stock and prices change with every order, so these read the database at
// request time: connection() tells Cache Components not to bake them into
// the page at build time.
async function Categories() {
  await connection()
  const categories = await listCategories()
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {categories.map((c) => (
        <li key={c.id}>
          <Link href={`/products?category=${c.slug}`} className="block h-full rounded-card border border-line-strong bg-paper p-4 no-underline transition-colors hover:border-brand hover:bg-tint">
            <span className="font-display text-2xl font-bold text-ink">{c.name}</span>
            <span className="figures mt-1 block text-sm text-muted">{c.productCount} products</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

async function Newest() {
  await connection()
  const page = await listProducts(anonymous, { sort: 'newest', limit: 4 })
  return (
    <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {page.items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
