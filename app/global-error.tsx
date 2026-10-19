// The last resort: an error in the ROOT layout itself. It replaces the whole
// document, so it brings its own <html> and <body> and only inline styles
// (globals.css may not have loaded).
'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#f6f3ea', color: '#18181b', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem' }}>Ìpamọ́ hit a problem</h1>
          <p>Something went wrong while loading the shop. No order was placed or charged.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: '1rem', padding: '0.7rem 1.2rem', borderRadius: '0.375rem', border: 0, background: '#1d1d22', color: '#f6f3ea', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
