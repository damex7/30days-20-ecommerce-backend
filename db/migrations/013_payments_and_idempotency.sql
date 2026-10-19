-- 013: two tables that make retries harmless.
--   payment_events   : every Paystack webhook (and callback verify) we
--                      received, so the same event is never applied twice.
--   idempotency_keys : the saved answer to a POST /api/v1/orders, so a
--                      double tap or a retry on a bad network can't make
--                      two orders.

-- ---------------------------------------------------------------------------
-- payment_events: the webhook log
-- ---------------------------------------------------------------------------
CREATE TABLE payment_events (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- THE DEDUPLICATION KEY. Paystack retries a webhook until it gets a 200,
  -- and may deliver the same event more than once. We build one id per
  -- real-world event ("charge.success:<transaction id>", or
  -- "verify:<transaction id>" for a callback check) and INSERT ... ON
  -- CONFLICT DO NOTHING: if the row already existed, the event was
  -- already handled and we stop there.
  event_id      text        NOT NULL UNIQUE CHECK (length(event_id) BETWEEN 1 AND 200),

  -- webhook : Paystack called /api/webhooks/paystack
  -- callback: our callback page asked Paystack's verify endpoint
  source        text        NOT NULL CHECK (source IN ('webhook', 'callback')),
  event_type    text        NOT NULL CHECK (length(event_type) <= 60),
  reference     text        NULL CHECK (length(reference) <= 100),

  -- SET NULL: the log outlives a (demo) order that is cleaned up.
  order_id      bigint      NULL REFERENCES orders (id) ON DELETE SET NULL,

  -- What Paystack said was paid, kept to show WHY a mismatch was refused.
  amount_kobo   bigint      NULL,
  currency      text        NULL CHECK (length(currency) <= 8),

  -- The event exactly as received, for support and debugging. (Paystack's
  -- payload contains no card numbers: only the last four digits and the
  -- card type.)
  payload       jsonb       NOT NULL,

  -- What we did with it. NULL while it's being processed.
  --   paid            : this event marked the order paid
  --   already_paid    : the order was already paid (the other path won)
  --   amount_mismatch : amount or currency didn't match the order: refused
  --   unknown_order   : no order with that reference
  --   needs_refund    : paid after the order had expired and the stock had
  --                     gone; staff must refund it by hand
  --   ignored         : an event type we don't act on
  --   failed          : Paystack reports the charge did not succeed
  outcome       text        NULL CHECK (outcome IN ('paid', 'already_paid', 'amount_mismatch', 'unknown_order', 'needs_refund', 'ignored', 'failed')),
  detail        text        NULL CHECK (length(detail) <= 500),

  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz NULL
);

-- The admin webhook log, newest first, and "events for this order".
CREATE INDEX payment_events_received_idx ON payment_events (received_at DESC, id DESC);
CREATE INDEX payment_events_order_idx ON payment_events (order_id) WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- idempotency_keys
-- ---------------------------------------------------------------------------
-- HOW IT WORKS (lib/api/idempotency.ts): the client sends a random
-- Idempotency-Key header with POST /orders. The first request with that key
-- INSERTs a row here (state in_progress) BEFORE doing the work, then saves
-- the response it sent. A repeat with the same key and the same body gets
-- the SAVED response (same order, same status) and nothing runs again.
-- The same key with a DIFFERENT body is a client bug, answered 422.
CREATE TABLE idempotency_keys (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Whose key: "user:<uuid>" or "key:<uuid>". Keys are scoped per caller,
  -- so one customer can't replay (or block) another's key.
  owner           text        NOT NULL CHECK (owner ~ '^(user|key):[0-9a-f-]{36}$'),

  -- Which operation, e.g. "POST /api/v1/orders": the same key may be
  -- reused for a different kind of request.
  endpoint        text        NOT NULL CHECK (length(endpoint) <= 100),

  -- The client's key: printable ASCII, up to 255 characters (a UUID is typical).
  key             text        NOT NULL CHECK (key ~ '^[\x21-\x7E]{1,255}$'),

  -- SHA-256 of the request body, to spot "same key, different body".
  request_hash    text        NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),

  -- in_progress : the first request is still running. A second one arriving
  --               now gets 409 "still processing" rather than a duplicate.
  -- done        : response_status/body hold the answer to replay.
  state           text        NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'done')),
  response_status smallint    NULL,
  response_body   jsonb       NULL,
  -- The Location header of a 201, replayed with it.
  response_location text      NULL,
  CHECK (state = 'in_progress' OR response_status IS NOT NULL),

  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz NULL,

  -- THE RULE ITSELF: one row per caller + operation + key. Two identical
  -- requests racing both try to INSERT; the UNIQUE index lets exactly one
  -- win, and the other sees the winner's row.
  UNIQUE (owner, endpoint, key)
);

-- Keys are kept for 24 hours (long enough for any retry), then the daily
-- cron deletes them. This index finds the old ones.
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);
