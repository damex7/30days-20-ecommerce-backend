import { DEMO_READ_ONLY_MESSAGE } from '@/lib/services/errors'

/**
 * Shown above the forms on admin pages for demo staff/admin. The buttons
 * underneath are DISABLED with aria-describedby pointing here, so visitors
 * can see what staff can do; the service layer refuses the writes anyway.
 */
export const READ_ONLY_NOTE_ID = 'read-only-note'

export function ReadOnlyNote({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p id={READ_ONLY_NOTE_ID} className="mb-5 rounded-control border-l-4 border-khaki bg-khaki-soft p-3 text-sm font-semibold text-khaki">
      <span className="stamp mr-2 rounded-control bg-khaki px-1.5 py-0.5 text-[0.6rem] text-on-khaki">Read-only</span>
      {DEMO_READ_ONLY_MESSAGE}
    </p>
  )
}
