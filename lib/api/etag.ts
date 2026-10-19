// ETAGS AND 304 for the public catalogue.
//
// An ETag is a fingerprint of a response body. We send it with the
// product list and each product:
//
//   200 OK
//   ETag: "pAx3…"
//   Cache-Control: public, max-age=60
//
// For 60 seconds a client (or a CDN in front of it) may reuse its copy
// without asking. After that it asks again, saying what it already has:
//
//   GET /api/v1/products/ona-loafer
//   If-None-Match: "pAx3…"
//
// If the product hasn't changed, the fingerprint is the same and we answer
// 304 Not Modified with NO BODY. WHAT THIS SAVES: the bytes (a product with
// its variants and images is a few KB; a phone on a metered connection in
// Aba downloads nothing), the client's time parsing and re-rendering, and
// battery. The server still runs the query (the data might have changed),
// but sending the answer is the expensive part on a slow network.
//
// The fingerprint is a hash of the exact JSON we'd send, so ANY change (a
// price, the stock count, an image) gives a new ETag. Personalised answers
// (a staff member listing drafts) are marked private, so a shared cache
// never hands them to someone else.
import 'server-only'

import { createHash } from 'node:crypto'

export function etagFor(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
}

/**
 * Does If-None-Match match? It may list several tags, or "*". Weak tags
 * (W/"…") compare equal to strong ones for this purpose (RFC 9110 weak
 * comparison), because a proxy may have weakened ours.
 */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  const strip = (tag: string) => tag.trim().replace(/^W\//, '')
  return header.split(',').some((tag) => strip(tag) === strip(etag))
}
