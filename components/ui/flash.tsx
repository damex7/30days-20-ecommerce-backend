// CLIENT COMPONENT: it fills a live region after the page has loaded, so
// screen readers announce the message.
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

/**
 * A short confirmation after a redirect ("You’re booked", "Service
 * saved"), passed in the URL as ?notice=… and turned into
 * words by the page.
 *
 * Why the effect: a live region only announces CHANGES. Text that is
 * already in the HTML when the page arrives is often not read out, so the
 * empty region renders first and the message is put into it a moment later.
 */
export function Flash({ message, tone = 'success' }: { message: string | null; tone?: 'success' | 'info' }) {
  const [shown, setShown] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShown(message), 60)
    return () => clearTimeout(timer)
  }, [message])

  const visible = shown && !dismissed
  return (
    <div role="status" aria-live="polite" className={cn(visible ? 'mb-5' : 'sr-only')}>
      {visible ? (
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-control border-l-4 p-3.5 motion-safe:animate-rise',
            tone === 'success' ? 'border-success bg-success-soft' : 'border-line-strong bg-raised',
          )}
        >
          <Icon name={tone === 'success' ? 'checkCircle' : 'info'} className={cn('mt-0.5', tone === 'success' ? 'text-success' : 'text-ink')} />
          <p className="flex-1 font-semibold">{shown}</p>
          <button type="button" onClick={() => setDismissed(true)} className="-m-1.5 grid size-9 place-items-center rounded-control text-muted hover:bg-tint hover:text-ink">
            <Icon name="close" className="size-4" label="Dismiss message" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
