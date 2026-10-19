// The shop, the account pages, the docs: header, page, footer.
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export default function ShopLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
