-- 010: carts. One per customer, kept in the database (not the browser), so
-- the same cart follows them from the phone app to the website.
CREATE TABLE carts (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- UNIQUE: exactly one cart per customer, created on first use with
  -- INSERT ... ON CONFLICT (customer_id) DO NOTHING, so two tabs adding at
  -- once can't make two carts. CASCADE: a cart is the customer's own
  -- scratch data.
  customer_id uuid        NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,

  -- The coupon the customer applied. Only a POINTER: it's re-checked on
  -- every cart view and again inside the checkout transaction, because it
  -- may expire or run out while it sits in the cart. SET NULL: if an admin
  -- deletes an unused coupon, carts simply lose it.
  coupon_id   bigint      NULL REFERENCES coupons (id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The ON DELETE SET NULL check when a coupon is deleted.
CREATE INDEX carts_coupon_idx ON carts (coupon_id) WHERE coupon_id IS NOT NULL;

CREATE TABLE cart_items (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id    bigint      NOT NULL REFERENCES carts (id) ON DELETE CASCADE,

  -- CASCADE: if a never-ordered variant is deleted, it just drops out of
  -- carts. (Ordered variants can't be deleted at all.)
  variant_id bigint      NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,

  -- 1 to 20: zero means "remove it" (a DELETE, not a row with 0), and a cap
  -- stops one cart reserving a whole shelf at checkout.
  quantity   integer     NOT NULL CHECK (quantity BETWEEN 1 AND 20),

  -- NO PRICE COLUMN, on purpose: the cart always shows the variant's price
  -- NOW, and checkout re-reads it inside the transaction. A price stored
  -- here would go stale, and a price sent by the client can't be trusted.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One line per variant: adding the same shoe again increases the
  -- quantity (ON CONFLICT (cart_id, variant_id) DO UPDATE). The unique
  -- index also serves "the items in this cart".
  UNIQUE (cart_id, variant_id)
);

CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The CASCADE when a variant is deleted needs to find its cart rows.
CREATE INDEX cart_items_variant_idx ON cart_items (variant_id);
