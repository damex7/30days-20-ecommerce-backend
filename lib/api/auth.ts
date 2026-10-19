// WHO IS CALLING THE API? Two kinds of credential (see lib/services/api-keys.ts):
//
//   Authorization: Bearer oja_live_…   → an API key (an integration)
//   the oja_session cookie             → a signed-in person
//
// An Authorization header always wins and is never "topped up" by the
// cookie: a request that sends a bad key gets 401, even from a browser
// that also happens to be signed in. Nothing at all → anonymous, which is
// fine for the public catalogue; the services refuse the rest with 401.
import 'server-only'

import { getCurrentSession } from '@/lib/auth/dal'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { anonymous, userActor, type Actor } from '@/lib/services/actor'
import { authenticateApiKey } from '@/lib/services/api-keys'
import { forbidden, ServiceError, unauthorized } from '@/lib/services/errors'

export const WWW_AUTHENTICATE = 'Bearer realm="oja-api", charset="UTF-8"'

export async function resolveActor(request: Request, ip: string): Promise<Actor> {
  const header = request.headers.get('authorization')
  if (header !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
    if (!match?.[1]) throw unauthorized('Send the key as "Authorization: Bearer oja_live_…".')
    const key = await authenticateApiKey(match[1])
    if (!key) throw unauthorized('That API key is not valid. It may be mistyped, revoked or expired.')

    // RATE LIMIT PER KEY (Day 17's limiter): 120 requests a minute for a
    // normal key, far fewer for the public demo key on /docs.
    const limit = await checkRateLimit(key.isDemo ? 'api_key_demo' : 'api_key', ip, key.id)
    if (!limit.ok) {
      throw new ServiceError('rate_limited', 'rate_limited', `This API key has made too many requests. Try again in ${limit.retryAfterSeconds} seconds.`, {
        retryAfterSeconds: limit.retryAfterSeconds,
      })
    }
    return { kind: 'api_key', key }
  }

  const current = await getCurrentSession()
  if (!current) return anonymous
  // A temporary password (an admin-created account) must be changed in the
  // browser first; until then the account can't use the API either.
  if (current.user.mustChangePassword) throw forbidden('password_change_required', 'Choose your own password at /account/password first.')
  return userActor(current.user)
}
