'use client'

import { useState } from 'react'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * Copies a ready-made text (an API key, a curl command, a temporary
 * password) to the clipboard. The
 * result is announced politely ("Copied") without moving focus. If the
 * clipboard is blocked (an old browser, or no permission), the text is
 * shown in a box, already selected, for copying by hand.
 */
export function CopyButton({ text, label, done = 'Copied.', small = false }: { text: string; label: string; done?: string; small?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 4000)
    } catch {
      setStatus('manual')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={small ? button.small : button.secondary}>
          <Icon name={status === 'copied' ? 'check' : 'copy'} />
          {label}
        </button>
        <p role="status" className="text-sm font-semibold text-success empty:sr-only">
          {status === 'copied' ? done : ''}
        </p>
      </div>
      {status === 'manual' ? (
        <label className="block text-sm">
          <span className="font-semibold">Copying isn’t allowed here. Select the text and copy it:</span>
          <textarea readOnly value={text} rows={Math.min(12, text.split('\n').length + 1)} className="field figures mt-1 block w-full p-2 text-xs" onFocus={(e) => e.currentTarget.select()} autoFocus />
        </label>
      ) : null}
    </div>
  )
}
