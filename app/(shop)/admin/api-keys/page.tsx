import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ApiKeyForm } from '@/components/admin/api-key-form'
import { READ_ONLY_NOTE_ID, ReadOnlyNote } from '@/components/admin/read-only-note'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { formatDate, fromNow } from '@/lib/dates'
import { listApiKeys } from '@/lib/services/api-keys'
import { isReadOnlyDemo } from '@/lib/services/permissions'
import { requireAdminActor } from '@/lib/services/session-actor'
import { revokeKeyAction } from './actions'

export const metadata: Metadata = { title: 'API keys' }

export default function ApiKeysPage() {
  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            For programs that call the <Link href="/docs" className="link">API</Link> without a person signing in. A key is shown once; only its prefix and
            a SHA-256 hash are stored.
          </>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <Keys />
      </Suspense>
    </>
  )
}

async function Keys() {
  const actor = await requireAdminActor()
  const keys = await listApiKeys(actor)
  const readOnly = isReadOnlyDemo(actor)
  return (
    <div className="space-y-6">
      <ReadOnlyNote show={readOnly} />
      {keys.length === 0 ? <p className="text-muted">No keys yet.</p> : null}
      <ul className="divide-y divide-dashed divide-line rounded-card border border-line bg-raised shadow-card">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-semibold">
                {k.name}
                {k.isDemo ? <span className="stamp ml-2 text-[0.6rem] text-muted">Docs demo</span> : null}
                {k.revokedAt ? <span className="stamp ml-2 text-[0.6rem] text-danger">Revoked {formatDate(k.revokedAt)}</span> : null}
              </p>
              {/* Only the PREFIX: the rest of the key exists nowhere on our side. */}
              <p className="font-mono text-sm">{k.prefix}…</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {k.scopes.map((s) => (
                  <span key={s} className="rounded-control bg-link-soft px-1.5 py-0.5 font-mono text-xs text-link">
                    {s}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-sm text-muted">
                Made by {k.createdByName} on {formatDate(k.createdAt)} · {k.lastUsedAt ? `last used ${fromNow(k.lastUsedAt)}` : 'never used'}
                {k.expiresAt ? ` · expires ${formatDate(k.expiresAt)}` : ''}
              </p>
            </div>
            {!k.revokedAt && !readOnly ? (
              <ConfirmAction
                action={revokeKeyAction}
                fields={{ id: k.id }}
                trigger="Revoke"
                title={`Revoke “${k.name}”?`}
                body={<p>Any program using it gets 401 from its next request. Order history still shows what it did.</p>}
                confirmLabel="Revoke key"
                danger
              />
            ) : null}
          </li>
        ))}
      </ul>
      <section aria-labelledby="new-key" className="max-w-3xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <h2 id="new-key" className="mb-4 text-2xl">
          New key
        </h2>
        <ApiKeyForm readOnly={readOnly} readOnlyId={READ_ONLY_NOTE_ID} />
      </section>
    </div>
  )
}
