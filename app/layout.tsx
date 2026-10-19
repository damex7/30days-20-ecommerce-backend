// ROOT LAYOUT: only what every page needs: <html>/<body>, fonts, the
// no-flash theme script, the skip link and (in demo mode) the demo banner.

import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Rokkitt, Space_Mono } from 'next/font/google'
import { Suspense } from 'react'
import { DemoBanner } from '@/components/site/demo-banner'
import { site } from '@/lib/site'
import { themeScript } from '@/lib/theme'
import './globals.css'

// next/font downloads the fonts at build time and serves them from this
// site: no request to Google from the visitor's browser and no layout jump.
//
// GLYPH CHECK (each font's cmap table was parsed): all three have ₦ (U+20A6),
// ọ Ọ ẹ ṣ à and the combining grave and dot below, which "Ọ̀nà" needs.
// Zilla Slab, Arvo, Bree Serif, Figtree, Instrument Sans, JetBrains Mono
// and Fira Code were ruled out for missing ₦ or the dotted letters.
//   ROKKITT: a condensed slab, like a maker's stamp pressed into leather. Headings.
//   NUNITO SANS: open and very readable on a phone, with TABULAR figures
//     (tnum) so columns of prices line up. Everything else.
//   SPACE MONO: SKUs, order numbers, API paths and code.
// The "vietnamese" subset carries ọ, ẹ and the combining marks.
const rokkitt = Rokkitt({ subsets: ['latin', 'latin-ext', 'vietnamese'], weight: ['600', '700', '800'], variable: '--font-rokkitt' })
const nunito = Nunito_Sans({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-nunito-sans' })
const spaceMono = Space_Mono({ subsets: ['latin', 'latin-ext', 'vietnamese'], weight: ['400', '700'], variable: '--font-space-mono' })

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3ecdf' },
    { media: '(prefers-color-scheme: dark)', color: '#15100d' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${rokkitt.variable} ${nunito.variable} ${spaceMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col text-base leading-relaxed antialiased">
        <a href="#main" className="sr-only z-50 rounded-control bg-brand px-4 py-2 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>
        {/* Demo mode only, and only for a signed-in demo account. */}
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
