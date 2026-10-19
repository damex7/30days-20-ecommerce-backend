-- 009: coupons. Admin-only to create; customers apply them in the cart.
--
-- Every rule a coupon can fail (inactive, not started, expired, used up,
-- minimum not met, already used by this customer) is checked in
-- lib/services/coupons.ts with a clear reason. The two that RACE (the last
-- use, the per-customer limit) are also guarded at checkout by a single
-- conditional UPDATE, so two customers can't both take the last use.
CREATE TABLE coupons (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- citext: "ABA10", "aba10" and "Aba10" are the same coupon, both for the
  -- UNIQUE rule and when a customer types it. The CHECK keeps codes short
  -- and easy to read out over the phone.
  code               citext      NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  description        text        NOT NULL DEFAULT '' CHECK (length(description) <= 200),

  -- percent : value is 1-100 (% off the subtotal)
  -- fixed   : value is kobo off the subtotal
  -- One column + a kind, with a CHECK tying them together, so a "150%"
  -- coupon or a "₦0 off" coupon can't exist.
  kind               text        NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value              bigint      NOT NULL,
  CHECK ((kind = 'percent' AND value BETWEEN 1 AND 100) OR (kind = 'fixed' AND value > 0)),

  -- The subtotal (before delivery) must be at least this much.
  min_order_kobo     bigint      NOT NULL DEFAULT 0 CHECK (min_order_kobo >= 0),

  -- NULL = unlimited. `uses` counts orders holding the coupon right now
  -- (an unpaid order that expires gives its use back). The CHECK is what
  -- makes "the last use" safe: an UPDATE that would push uses past
  -- max_uses fails instead of overselling the coupon.
  max_uses           integer     NULL CHECK (max_uses > 0),
  uses               integer     NOT NULL DEFAULT 0 CHECK (uses >= 0),
  CHECK (max_uses IS NULL OR uses <= max_uses),

  -- NULL = no limit per customer. Counted from coupon_redemptions (012).
  per_customer_limit integer     NULL CHECK (per_customer_limit > 0),

  -- The window it works in. NULL start = from now; NULL end = no end.
  starts_at          timestamptz NULL,
  ends_at            timestamptz NULL,
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),

  -- A switch to pause a coupon without deleting it (deleting would be
  -- refused anyway once it has redemptions: history).
  active             boolean     NOT NULL DEFAULT true,

  version            integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER coupons_set_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The admin list, newest first. (Lookup by code uses the UNIQUE index.)
CREATE INDEX coupons_created_idx ON coupons (created_at DESC, id DESC);
