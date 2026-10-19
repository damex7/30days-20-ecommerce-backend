import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cache Components (the Next.js 16.4 default): nothing is cached unless a
  // function says 'use cache'. Every page that reads the session cookie
  // does so inside <Suspense>, so the rest of the page can still be sent
  // straight away.
  cacheComponents: true,
  partialPrefetching: true,

  // SECURITY HEADERS, sent with every response (pages and the API).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CLICKJACKING: no other site may show our pages in a frame, where
          // a "Pay" or "Revoke key" button could be hidden under a decoy.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Browsers must trust our Content-Type and never "guess" that a
          // JSON response is a script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Other sites we link to (Paystack) learn only our domain, never the full URL.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Pages whose URL contains a secret token: send NO Referer at all.
        source: '/(reset-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },

  turbopack: {
    // Pin the project root: there is an unrelated package-lock.json higher up
    // in the home folder that Turbopack would otherwise consider.
    root: __dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
