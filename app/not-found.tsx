import type { Metadata } from 'next'
import { NotFoundContent } from '@/components/site/not-found-content'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = { title: 'Page not found' }

/** A URL that matches no route at all: the full page, with its own header and footer. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </div>
  )
}
