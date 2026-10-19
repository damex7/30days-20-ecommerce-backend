import Link from 'next/link'
import { Mark } from './mark'

/** The mark plus the name, as a stamped label. Links home. */
export function Logo() {
  return (
    <Link href="/" className="group mr-auto inline-flex min-h-11 items-center gap-2 rounded-control pr-2 text-brand no-underline">
      <Mark className="size-9 shrink-0 transition-transform group-hover:-rotate-6" />
      <span className="leading-none">
        <span className="block font-display text-[1.6rem] font-extrabold tracking-wide text-ink">Ọjà</span>
        <span className="stamp block text-[0.6rem] text-muted max-[380px]:hidden">Made in Aba</span>
      </span>
    </Link>
  )
}
