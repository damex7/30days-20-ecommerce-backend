/**
 * THE MARK: a stretched hide, the shape a cowhide takes pegged out to dry,
 * with a line of saddle stitching running round inside its edge. Drawn by
 * hand as one path (no icon pack). It takes the current text colour, so it
 * is espresso on canvas and tan on walnut without a second file.
 */
export function Mark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M24 3.5c3.2 0 4.6 2.6 7.6 2.9 3.4.4 5.8-1.6 8.4.4 2.4 1.9.6 5 2 7.8 1.3 2.6 4.6 3.6 4.4 6.9-.2 3.2-3.6 3.8-4.2 6.8-.6 3 2 5.6.4 8.5-1.7 3.1-5.4 1.8-8 3.6-2.6 1.8-2.9 5.1-6.4 5.4-3 .3-3.6-2.7-6.4-2.8-2.8.1-3.4 3.1-6.4 2.8-3.5-.3-3.8-3.6-6.4-5.4-2.6-1.8-6.3-.5-8-3.6-1.6-2.9 1-5.5.4-8.5-.6-3-4-3.6-4.2-6.8-.2-3.3 3.1-4.3 4.4-6.9 1.4-2.8-.4-5.9 2-7.8 2.6-2 5 0 8.4-.4 3-.3 4.4-2.9 7.6-2.9Z"
      />
      <path
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.4 2.6"
        d="M24 8.3c2.6 0 4 2.1 6.6 2.4 2.9.3 4.8-1.2 6.6.2 1.6 1.3.4 3.7 1.6 6.1 1.1 2.1 3.6 2.9 3.5 5.4-.2 2.5-2.9 3-3.3 5.4-.5 2.4 1.5 4.4.3 6.6-1.3 2.3-4.2 1.4-6.3 2.8-2.1 1.4-2.3 4-5 4.2-2.3.2-2.8-2.1-5-2.2-2.2.1-2.7 2.4-5 2.2-2.7-.2-2.9-2.8-5-4.2-2.1-1.4-5-.5-6.3-2.8-1.2-2.2.8-4.2.3-6.6-.4-2.4-3.1-2.9-3.3-5.4-.1-2.5 2.4-3.3 3.5-5.4 1.2-2.4 0-4.8 1.6-6.1 1.8-1.4 3.7.1 6.6-.2 2.6-.3 4-2.4 6.6-2.4Z"
      />
      {/* The awl hole and thread of the maker's mark, centre. */}
      <circle cx="24" cy="24.5" r="3.2" fill="var(--color-paper)" />
      <circle cx="24" cy="24.5" r="1.3" fill="currentColor" />
    </svg>
  )
}
