-- 012: orders, what was in them, what happened to them, and which coupon
-- they used.
--
-- THE SNAPSHOT RULE: an order records the world AS IT WAS at checkout.
-- Product names, variant labels, SKUs, unit prices and the delivery
-- address are COPIED into the order, not joined from the live tables.
-- Next month the loafer may cost more, be renamed or be archived, and the
-- customer may move house; their receipt, the packing slip and the sales
-- report must still say what was actually sold, at what price, and where
-- it went.

-- Order numbers people can read out on the phone: OJA-2026-000123.
-- A SEQUENCE hands out numbers safely to concurrent checkouts (no two
-- orders ever get the same one) without locking. Gaps are normal: a
-- checkout that rolls back still uses its number.
CREATE SEQUENCE order_number_seq;

CREATE TABLE orders (
  -- The internal key. The number below is what humans see.
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- The year is the year in Lagos, not UTC, so an order at 00:30 on
  -- 1 January says the new year.
  number            text        NOT NULL UNIQUE
                    DEFAULT ('OJA-' || to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0')),

  -- SET NULL, not CASCADE or RESTRICT. Real customers are never deleted
  -- (deactivated instead), so in practice this only fires when the cron
  -- removes a 24-hour-old DEMO customer: their PAID demo orders stay in the
  -- books (is_demo = true keeps them out of real sales figures), just no
  -- longer linked to a person.
  customer_id       uuid        NULL REFERENCES users (id) ON DELETE SET NULL,

  -- Who to send the receipt to, as it was at checkout.
  customer_email    text        NOT NULL CHECK (length(customer_email) BETWEEN 3 AND 254),
  customer_name     text        NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 100),

  -- THE STATE MACHINE (lib/services/order-status.ts lists every allowed
  -- move and who may make it). The CHECK only lists the states; the moves
  -- are rules in one TypeScript table, enforced by a guarded UPDATE.
  status            text        NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                      'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
                    )),

  -- MONEY, all integer kobo, all worked out on the SERVER from live prices.
  subtotal_kobo     bigint      NOT NULL CHECK (subtotal_kobo >= 0),
  discount_kobo     bigint      NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  delivery_fee_kobo bigint      NOT NULL CHECK (delivery_fee_kobo >= 0),
  total_kobo        bigint      NOT NULL CHECK (total_kobo >= 0),
  -- The arithmetic is a rule of the DATA: a bug that charges the wrong
  -- total can't be saved. A discount can't exceed the goods it discounts.
  CONSTRAINT orders_total_adds_up CHECK (total_kobo = subtotal_kobo - discount_kobo + delivery_fee_kobo),
  CONSTRAINT orders_discount_within_subtotal CHECK (discount_kobo <= subtotal_kobo),

  -- Always NGN today. A column (with a CHECK) rather than an assumption,
  -- so the webhook can compare Paystack's currency with ours, and a second
  -- currency later is a CHECK change, not a guess about old rows.
  currency          text        NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),

  -- The code as typed, copied (the coupon itself may later be edited).
  coupon_code       text        NULL,

  -- THE SHIPPING ADDRESS, COPIED. Not a foreign key to addresses: the
  -- customer may edit or delete that address tomorrow.
  ship_recipient    text        NOT NULL,
  ship_phone        text        NOT NULL CHECK (ship_phone ~ '^\+234[0-9]{10}$'),
  ship_street       text        NOT NULL,
  ship_city         text        NOT NULL,
  ship_state        text        NOT NULL,
  ship_landmark     text        NULL,
  delivery_min_days smallint    NOT NULL,
  delivery_max_days smallint    NOT NULL,

  -- Our reference for this order's payment at Paystack. UNIQUE: one
  -- reference names one order, so a webhook can't be applied to the wrong
  -- order. Set at checkout, before the customer reaches Paystack.
  paystack_reference text       NOT NULL UNIQUE CHECK (paystack_reference ~ '^[A-Za-z0-9_-]{8,64}$'),

  -- Paystack refuses a second "initialize" for the same reference, so the
  -- checkout link from the first one is kept and reused if the customer
  -- comes back to pay (another tab, a retry after a network drop).
  paystack_authorization_url text NULL CHECK (paystack_authorization_url ~ '^https://'),

  paid_at           timestamptz NULL,

  -- UNPAID ORDERS RESERVE STOCK for 30 minutes. After that they are
  -- cancelled and the stock (and coupon use) goes back: lazily whenever
  -- orders are read, and by the daily cron (lib/services/expiry.ts).
  expires_at        timestamptz NULL,
  cancelled_at      timestamptz NULL,

  -- Every pending order has an expiry; every order that was ever paid has
  -- a paid_at. These keep the timestamps honest whatever the code does.
  CONSTRAINT orders_pending_has_expiry CHECK (status <> 'pending_payment' OR expires_at IS NOT NULL),
  CONSTRAINT orders_paid_has_paid_at CHECK (status NOT IN ('paid', 'processing', 'shipped', 'delivered', 'refunded') OR paid_at IS NOT NULL),

  -- Placed by a demo customer: excluded from real sales figures.
  is_demo           boolean     NOT NULL DEFAULT false,

  -- Optimistic concurrency for status changes: two staff pressing
  -- "Ship" and "Refund" at once can't both win.
  version           integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- "My orders, newest first" (/account and GET /orders as a customer).
-- The id at the end is the cursor's tie-breaker.
CREATE INDEX orders_customer_created_idx ON orders (customer_id, created_at DESC, id DESC);

-- ADMIN ORDERS: "paid orders this week, newest first". Status first
-- because the filter is an equality, then the date range and sort.
CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC, id DESC);

-- Admin orders with no status filter.
CREATE INDEX orders_created_idx ON orders (created_at DESC, id DESC);

-- THE EXPIRY SWEEP: "pending orders whose time is up". A PARTIAL index
-- containing only pending orders, so it stays tiny as paid orders pile up.
CREATE INDEX orders_pending_expiry_idx ON orders (expires_at) WHERE status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- order_items: the lines of an order, COPIED at purchase
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: lines are part of the order (only unpaid demo orders are
  -- ever deleted).
  order_id        bigint      NOT NULL REFERENCES orders (id) ON DELETE CASCADE,

  -- RESTRICT: a variant that has been sold can never be deleted, only
  -- archived. This keeps "which variant was it?" answerable (for restocking
  -- on a refund) and is what stops a sold product being hard-deleted.
  variant_id      bigint      NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,

  -- COPIED at checkout (the snapshot rule above).
  product_name    text        NOT NULL,
  product_slug    text        NOT NULL,
  variant_label   text        NOT NULL,
  sku             text        NOT NULL,
  unit_price_kobo bigint      NOT NULL CHECK (unit_price_kobo >= 0),
  quantity        integer     NOT NULL CHECK (quantity BETWEEN 1 AND 20),

  -- Worked out by the database, so it can't disagree with price × qty.
  line_total_kobo bigint      GENERATED ALWAYS AS (unit_price_kobo * quantity) STORED,

  -- One line per variant (the cart already merges them).
  UNIQUE (order_id, variant_id)
);

-- The RESTRICT check when a variant is deleted ("has it ever been sold?"),
-- which the admin also asks before offering Delete or Archive.
CREATE INDEX order_items_variant_idx ON order_items (variant_id);

-- ---------------------------------------------------------------------------
-- order_events: the order's history, APPEND-ONLY
-- ---------------------------------------------------------------------------
CREATE TABLE order_events (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         bigint      NOT NULL REFERENCES orders (id) ON DELETE CASCADE,

  -- created          : checkout
  -- status_changed   : any move in the state machine (from → to)
  -- payment_received : Paystack confirmed the money (with the reference)
  -- note_added       : a staff note ("customer asked for Friday delivery")
  type             text        NOT NULL CHECK (type IN ('created', 'status_changed', 'payment_received', 'note_added')),
  from_status      text        NULL,
  to_status        text        NULL,
  CHECK (type <> 'status_changed' OR (from_status IS NOT NULL AND to_status IS NOT NULL)),
  note             text        NULL CHECK (length(note) <= 1000),

  -- WHO did it: a person, an API key, or neither (the system: the expiry
  -- sweep, a webhook). SET NULL keeps the event if the actor goes away;
  -- actor_label is COPIED so the timeline still says "Ada (staff)" or
  -- 'API key "GIG courier"' after that.
  actor_user_id    uuid        NULL REFERENCES users (id) ON DELETE SET NULL,
  actor_api_key_id uuid        NULL REFERENCES api_keys (id) ON DELETE SET NULL,
  actor_label      text        NOT NULL CHECK (length(actor_label) BETWEEN 1 AND 120),

  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- An order's timeline, oldest first.
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at, id);
-- The SET NULL checks when an actor is deleted.
CREATE INDEX order_events_actor_user_idx ON order_events (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX order_events_actor_key_idx ON order_events (actor_api_key_id) WHERE actor_api_key_id IS NOT NULL;

-- APPEND-ONLY, enforced by the database (as Day 18's stock ledger was): a
-- history that can be edited isn't a history. UPDATE is always refused.
-- DELETE is refused too, EXCEPT when it comes from the order itself being
-- deleted. ON DELETE CASCADE runs inside PostgreSQL's own referential
-- trigger, so this trigger then sees pg_trigger_depth() = 2; a direct
-- DELETE on order_events sees 1. That only happens for unpaid demo orders.
CREATE OR REPLACE FUNCTION order_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'order_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER order_events_no_update BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION order_events_append_only();

-- ---------------------------------------------------------------------------
-- coupon_redemptions: which order used which coupon
-- ---------------------------------------------------------------------------
-- The per-customer limit counts these rows. When an unpaid order expires,
-- its redemption row is deleted and coupons.uses goes down by one, in the
-- same transaction, so the use is given back.
CREATE TABLE coupon_redemptions (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- RESTRICT: a coupon that has been used is history; deactivate it
  -- instead of deleting it.
  coupon_id     bigint      NOT NULL REFERENCES coupons (id) ON DELETE RESTRICT,

  -- SET NULL for the same reason as orders.customer_id (demo cleanup).
  customer_id   uuid        NULL REFERENCES users (id) ON DELETE SET NULL,

  -- UNIQUE: at most one coupon per order. CASCADE: it belongs to the order.
  order_id      bigint      NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,

  discount_kobo bigint      NOT NULL CHECK (discount_kobo >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- "How many times has this customer used this coupon?"
CREATE INDEX coupon_redemptions_coupon_customer_idx ON coupon_redemptions (coupon_id, customer_id);
-- The SET NULL check when a demo customer is deleted.
CREATE INDEX coupon_redemptions_customer_idx ON coupon_redemptions (customer_id);
