import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './icon'

type Tone = 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, { box: string; title: string; icon: IconName; word: string }> = {
  success: { box: 'border-success bg-success-soft', title: 'text-success', icon: 'checkCircle', word: 'Success' },
  warning: { box: 'border-warning bg-warning-soft', title: 'text-warning', icon: 'alert', word: 'Warning' },
  danger: { box: 'border-danger bg-danger-soft', title: 'text-danger', icon: 'errorCircle', word: 'Error' },
  info: { box: 'border-line-strong bg-raised', title: 'text-ink', icon: 'info', word: 'Note' },
}

/**
 * A status message box. Colour is never the only signal: each tone has its
 * own icon and a hidden word ("Warning:") for screen readers.
 * `role="status"` makes a message that appears later get announced.
 */
export function Notice({ tone, title, children, className, live = false }: { tone: Tone; title: string; children?: ReactNode; className?: string; live?: boolean }) {
  const t = TONES[tone]
  return (
    <div role={live ? 'status' : undefined} className={cn('rounded-control border-l-4 p-4', t.box, className)}>
      <p className={cn('flex items-center gap-2 font-bold', t.title)}>
        <Icon name={t.icon} />
        <span>
          <span className="sr-only">{t.word}: </span>
          {title}
        </span>
      </p>
      {children ? <div className="mt-1.5 pl-7 text-[0.95rem] [&_a]:font-semibold [&_a]:text-ink [&_a]:underline">{children}</div> : null}
    </div>
  )
}
