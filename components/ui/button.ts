// Button looks as class strings, so <button>, <Link> and form buttons can
// share them without a wrapper component. Every button is at least 44px
// tall, a comfortable touch target; `large` (56px) is for the main step on
// each page, easy to hit with one thumb on a phone.

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-[0.95rem] font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export const button = {
  primary: `${base} bg-brand text-on-brand hover:bg-brand-hover`,
  secondary: `${base} border border-line-strong bg-raised text-ink hover:bg-tint`,
  ghost: `${base} text-ink hover:bg-tint`,
  danger: `${base} bg-danger text-on-danger hover:bg-danger-hover`,
  dangerOutline: `${base} border border-danger bg-raised text-danger hover:bg-danger-soft`,
  large: 'inline-flex min-h-14 items-center justify-center gap-2 rounded-control bg-brand px-5 text-lg font-bold text-on-brand no-underline transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60',
  largeSecondary:
    'inline-flex min-h-14 items-center justify-center gap-2 rounded-control border border-line-strong bg-raised px-5 text-lg font-bold text-ink no-underline transition-colors hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60',
  small:
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-raised px-3 text-sm font-semibold text-ink no-underline transition-colors hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60',
  icon: 'inline-grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-tint hover:text-ink disabled:cursor-not-allowed disabled:opacity-45',
}
