-- 011: API keys, for integrations (a courier's system, a stock app, an
-- accounting export) that call /api/v1 without a person signing in.
--
-- A key looks like  oja_live_8fK2pQ…  (lib/services/api-keys.ts). It is
-- shown ONCE when created; only its SHA-256 hash is stored. Why SHA-256 and
-- not argon2 like passwords? A password is short and human-chosen, so a
-- stolen hash can be brute-forced unless hashing is deliberately slow.
-- An API key is 32 random bytes (256 bits): there is nothing to guess, so a
-- fast hash is just as safe, and it lets the key be looked up by its hash
-- with an index on every request (argon2 would cost ~50 ms per call and
-- can't be indexed, because each hash has its own random salt).
CREATE TABLE api_keys (
  -- uuid: key ids appear in URLs (DELETE /api/v1/api-keys/<id>).
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What it's for: "Courier: GIG Logistics", "Stock sync".
  name         text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),

  -- The first characters of the key, e.g. "oja_live_8fK2pQ", kept in clear
  -- so an admin can tell keys apart in the list and match a key found in a
  -- log, without the secret ever being shown again. UNIQUE so a prefix
  -- names one key.
  prefix       text        NOT NULL UNIQUE CHECK (prefix ~ '^oja_live_[A-Za-z0-9_-]{6}$'),

  -- SHA-256 of the WHOLE key, as 64 hex characters. UNIQUE gives the index
  -- that every API request uses to find its key.
  key_hash     text        NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),

  -- What the key may do. An array checked against the fixed list with <@
  -- ("is contained by"), and never empty. Every endpoint names the scope
  -- it needs (lib/api/endpoints.ts).
  scopes       text[]      NOT NULL CHECK (
                 cardinality(scopes) >= 1
                 AND scopes <@ ARRAY['catalog:read', 'catalog:write', 'orders:read', 'orders:write']::text[]
               ),

  -- The demo key printed on /docs: catalog:read only, with a tighter rate
  -- limit. Its plaintext comes from DEMO_API_KEY; only its hash is here.
  is_demo      boolean     NOT NULL DEFAULT false,

  -- RESTRICT: we always want to know which admin created a key. (Users are
  -- deactivated, never deleted, so this never blocks anything real.)
  created_by   uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- Written at most once a minute per key, so a busy integration doesn't
  -- turn every read into a write. Shows admins which keys are still in use.
  last_used_at timestamptz NULL,

  -- Optional end date: a key for a one-off import can expire by itself.
  expires_at   timestamptz NULL,

  -- Revoked keys are kept (not deleted) so order events that name them
  -- still say which integration made the change. A timestamp records when.
  revoked_at   timestamptz NULL,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The admin list, newest first.
CREATE INDEX api_keys_created_idx ON api_keys (created_at DESC);
-- The RESTRICT check if a user row is ever deleted.
CREATE INDEX api_keys_created_by_idx ON api_keys (created_by);
