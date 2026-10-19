'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'

export type AdminNavItem = { href: string; label: string; icon: IconName }

/**
 * The workshop's tabs. aria-current="page" marks where you are, for screen
 * readers and for the style. Scrolls sideways on a phone instead of wrapping.
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Workshop" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-[3px] border-transparent px-3 font-semibold text-muted no-underline hover:text-ink aria-[current=page]:border-brand aria-[current=page]:text-ink"
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
