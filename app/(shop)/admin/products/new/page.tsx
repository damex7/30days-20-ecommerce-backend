import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProductForm } from '@/components/admin/product-forms'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { listCategories } from '@/lib/services/catalog'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireShopActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'New product' }

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" back={{ href: '/admin/products', label: 'Products' }} description="Create it as a draft, add sizes and colours, then set it to Active." />
      <Suspense fallback={<PageSkeleton />}>
        <NewProduct />
      </Suspense>
    </>
  )
}

async function NewProduct() {
  const actor = await requireShopActor()
  const categories = await listCategories()
  const readOnly = isReadOnlyDemo(actor)
  return (
    <section className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
      <ReadOnlyNote show={readOnly} />
      <ProductForm categories={categories} readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
    </section>
  )
}
