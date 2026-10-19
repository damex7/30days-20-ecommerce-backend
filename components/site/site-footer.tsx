import Link from 'next/link'
import { site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-sunken">
      <div className="seam" aria-hidden />
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6">
        <p>
          <span className="font-display text-base font-bold text-ink">{site.name}</span> · cut and stitched in {site.workshop}.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/products" className="link">Shop</Link>
          <Link href="/docs" className="link">API reference</Link>
          <a href="/api/v1/openapi.json" className="link">OpenAPI JSON</a>
        </nav>
      </div>
    </footer>
  )
}
