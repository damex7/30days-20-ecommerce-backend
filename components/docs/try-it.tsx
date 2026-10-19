'use client'

import { useId, useState } from 'react'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

type Result = { status: number; statusText: string; headers: [string, string][]; body: string; ms: number }

const SHOWN_HEADERS = ['content-type', 'x-request-id', 'etag', 'cache-control', 'location', 'retry-after', 'www-authenticate']

/**
 * "Try it" for GET endpoints: a real request from this page to the API.
 * It is same-origin, so the browser sends the session cookie and the call
 * runs AS YOU (a demo customer, demo staff, or nobody). With a demo key
 * given, it sends Authorization: Bearer instead, like an integration would.
 */
export function TryIt({ path, demoKey }: { path: string; demoKey: string | null }) {
  const [url, setUrl] = useState(path)
  const [useKey, setUseKey] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const ids = useId()

  async function run() {
    setBusy(true)
    const started = performance.now()
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', ...(useKey && demoKey ? { Authorization: `Bearer ${demoKey}` } : {}) }, credentials: useKey ? 'omit' : 'same-origin', cache: 'no-store' })
      const text = await response.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // not JSON: show as is
      }
      setResult({
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()].filter(([k]) => SHOWN_HEADERS.includes(k)),
        body: body.length > 6000 ? `${body.slice(0, 6000)}\n… (cut short)` : body,
        ms: Math.round(performance.now() - started),
      })
    } catch (error) {
      setResult({ status: 0, statusText: error instanceof Error ? error.message : 'Network error', headers: [], body: '', ms: 0 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-control border border-link bg-link-soft p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={`${ids}-url`} className="min-w-0 flex-1 basis-56 text-sm">
          <span className="block font-semibold text-link">Request (GET)</span>
          <input id={`${ids}-url`} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} className="field mt-1 min-h-10 w-full px-2 font-mono text-xs" />
        </label>
        <button type="button" onClick={run} disabled={busy || !url.startsWith('/api/')} className={button.secondary}>
          <Icon name={busy ? 'clock' : 'arrowRight'} />
          {busy ? 'Sending…' : 'Try it'}
        </button>
      </div>
      {demoKey ? (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} className="size-4 accent-brand" />
          Send the demo API key instead of my session cookie
        </label>
      ) : null}
      <div aria-live="polite" className="empty:hidden">
        {result ? (
          <div className="relative mt-3">
            <p className="font-mono text-sm font-bold">
              {result.status} {result.statusText} <span className="font-normal text-muted">· {result.ms} ms</span>
            </p>
            {result.headers.length > 0 ? (
              <pre className="mt-1 overflow-x-auto rounded-control bg-raised p-2 text-xs">{result.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
            ) : null}
            {result.body ? <pre className="mt-2 max-h-80 overflow-auto rounded-control bg-raised p-2 text-xs">{result.body}</pre> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
