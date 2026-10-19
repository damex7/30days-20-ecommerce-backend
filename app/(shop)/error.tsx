'use client'

import { ErrorPanel } from '@/components/site/error-panel'

export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />
}
