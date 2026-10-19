-- 007: the catalogue. Categories hold products; a product (the "Ọ̀nà
-- loafer") is sold as VARIANTS (size 42 in tan), and each variant is the
-- thing with its own SKU, price and stock. Images belong to the product.

-- ---------------------------------------------------------------------------
-- categories: shoes, bags, belts, sandals
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  -- A small counting id is fine: categories are few and public anyway.
  id          smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- The URL form (?category=bags). UNIQUE because two categories with one
  -- slug would make the filter ambiguous; the CHECK keeps it URL-safe.
  slug        text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 40),
  name        text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  description text        NOT NULL DEFAULT '' CHECK (length(description) <= 500),

  -- Display order in the navigation and filters (0 first). Not unique: two
  -- equal positions just fall back to the name.
  position    smallint    NOT NULL DEFAULT 0 CHECK (position >= 0),

  version     integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  -- bigint: a catalogue that keeps every archived product for the order
  -- history never runs out. Ids appear in admin and API URLs; the public
  -- storefront uses the slug.
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- /products/ona-loafer. UNIQUE so one URL means one product.
  slug            text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  name            text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description     text        NOT NULL DEFAULT '' CHECK (length(description) <= 5000),

  -- RESTRICT: a category with products can't be deleted out from under
  -- them (the products would lose their place in the shop). Move or
  -- archive the products first.
  category_id     smallint    NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,

  -- draft    : being prepared, staff only
  -- active   : on sale
  -- archived : no longer sold, but kept because orders point at its
  --            variants (order_items.variant_id is RESTRICT). Products that
  --            appear in orders are archived, never hard-deleted.
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),

  -- FULL-TEXT SEARCH (as on Day 16). A GENERATED column: PostgreSQL keeps
  -- it in step with name and description on every write, so no code can
  -- forget. Weight A (name) ranks above B (description). 'simple' would
  -- miss "loafers" → "loafer"; 'english' stems words, which suits product
  -- names written in English (Yoruba names still match exactly).
  search          tsvector    GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', name), 'A') ||
                    setweight(to_tsvector('english', description), 'B')
                  ) STORED,

  -- DENORMALISED from the variants by the trigger below: the lowest active
  -- variant price ("from ₦45,000") and whether any active variant has
  -- stock. They live on the product row so that "sort by price" and "in
  -- stock only" are an INDEX scan with a stable cursor key, instead of an
  -- aggregate over every variant of every product on each page load.
  -- NULL price = no active variant yet (a draft being prepared).
  price_from_kobo bigint      NULL CHECK (price_from_kobo >= 0),
  in_stock        boolean     NOT NULL DEFAULT false,

  -- OPTIMISTIC CONCURRENCY: every PATCH sends the version it read; the
  -- UPDATE only matches if it's still current, and bumps it. Two staff
  -- editing the same product can't silently overwrite each other: the
  -- second gets 409 Conflict.
  version         integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- THE PRODUCT LIST QUERY's indexes. The public list always asks for
-- status = 'active', so these are PARTIAL indexes holding only active
-- products (drafts and the growing pile of archived products cost nothing).
-- Each one ends in id, matching the cursor's tie-breaker (lib/api/pagination.ts).
--   sort=newest     → ORDER BY created_at DESC, id DESC
--   sort=price_asc  → ORDER BY price_from_kobo, id   (read backwards for price_desc)
--   category filter → (category_id, created_at DESC, id DESC)
CREATE INDEX products_active_newest_idx ON products (created_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX products_active_price_idx ON products (price_from_kobo, id) WHERE status = 'active';
CREATE INDEX products_active_category_idx ON products (category_id, created_at DESC, id DESC) WHERE status = 'active';
-- Also needed for the RESTRICT check when a category is deleted.
CREATE INDEX products_category_idx ON products (category_id);
-- GIN = an inverted index: word → products containing it. Makes `search @@
-- websearch_to_tsquery(...)` fast.
CREATE INDEX products_search_idx ON products USING gin (search);

-- ---------------------------------------------------------------------------
-- product_variants: the thing actually bought
-- ---------------------------------------------------------------------------
CREATE TABLE product_variants (
  id                    bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: a variant has no meaning without its product, so deleting a
  -- (never-ordered) draft product takes its variants with it. A variant
  -- that HAS been ordered is protected by order_items' RESTRICT, which
  -- also stops the cascade, so an ordered product can only be archived.
  product_id            bigint      NOT NULL REFERENCES products (id) ON DELETE CASCADE,

  -- Stock keeping unit: the code on the shelf label and the packing slip,
  -- e.g. ONA-LOAF-42-TAN. UNIQUE across the shop, upper-case only.
  sku                   text        NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND length(sku) <= 40),

  -- Free text, because a shoe's size is "42", a belt's is "34in" and a bag's
  -- is "One size". Filters compare them case-insensitively.
  size                  text        NOT NULL CHECK (length(btrim(size)) BETWEEN 1 AND 20),
  colour                text        NOT NULL CHECK (length(btrim(colour)) BETWEEN 1 AND 30),

  -- INTEGER KOBO, never floats (lib/money.ts). Up to ₦100 million.
  price_kobo            bigint      NOT NULL CHECK (price_kobo >= 0 AND price_kobo <= 10000000000),

  -- The "was" price, shown struck through on a sale. NULL = not on sale.
  -- Must be HIGHER than the price, or the strike-through would be a lie.
  compare_at_price_kobo bigint      NULL CHECK (compare_at_price_kobo IS NULL OR compare_at_price_kobo > price_kobo),

  -- Units on the shelf that are not reserved by an unpaid order. The CHECK
  -- is the last line of defence against overselling: even a buggy query
  -- can't take it below zero (checkout's guarded UPDATE relies on it).
  stock                 integer     NOT NULL DEFAULT 0 CHECK (stock >= 0),

  -- archived = no longer sold (kept for order history, like products).
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  version               integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One variant per size and colour of a product ("42 / Tan" twice would make
-- the size picker ambiguous). An expression index, so "Tan" and "tan"
-- count as the same. It also serves two hot lookups:
--   - "the variants of product 7" (its leading column), and
--   - the list filter `EXISTS (... WHERE v.product_id = p.id AND lower(v.size) = '42')`.
CREATE UNIQUE INDEX product_variants_product_size_colour_key
  ON product_variants (product_id, lower(size), lower(colour));

-- ---------------------------------------------------------------------------
-- Keeping products.price_from_kobo and in_stock in step with the variants.
-- ---------------------------------------------------------------------------
-- Runs after any change to a variant's price, stock, status or product.
-- It only WRITES when a value actually changes (IS DISTINCT FROM), so a sale
-- that leaves stock above zero doesn't touch the product row at all, and
-- two checkouts for different variants of one product rarely wait on
-- each other's lock.
CREATE OR REPLACE FUNCTION refresh_product_summary(p_product_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE products p SET
    price_from_kobo = s.price_from,
    in_stock = s.in_stock
  FROM (
    SELECT min(v.price_kobo) FILTER (WHERE v.status = 'active') AS price_from,
           coalesce(bool_or(v.stock > 0 AND v.status = 'active'), false) AS in_stock
    FROM product_variants v WHERE v.product_id = p_product_id
  ) s
  WHERE p.id = p_product_id
    AND (p.price_from_kobo, p.in_stock) IS DISTINCT FROM (s.price_from, s.in_stock);
$$;

CREATE OR REPLACE FUNCTION product_variants_refresh_summary() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_product_summary(OLD.product_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) THEN
    PERFORM refresh_product_summary(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER product_variants_summary_ins_del
  AFTER INSERT OR DELETE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION product_variants_refresh_summary();

-- WHEN (...) skips the function entirely for edits that can't change the
-- summary (a SKU typo fix, a version bump).
CREATE TRIGGER product_variants_summary_upd
  AFTER UPDATE OF price_kobo, stock, status, product_id ON product_variants
  FOR EACH ROW
  WHEN (OLD.price_kobo IS DISTINCT FROM NEW.price_kobo
        OR (OLD.stock > 0) IS DISTINCT FROM (NEW.stock > 0)
        OR OLD.status IS DISTINCT FROM NEW.status
        OR OLD.product_id IS DISTINCT FROM NEW.product_id)
  EXECUTE FUNCTION product_variants_refresh_summary();

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------
CREATE TABLE product_images (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: an image is part of its product and nothing else points at it.
  product_id bigint      NOT NULL REFERENCES products (id) ON DELETE CASCADE,

  -- A path under /public today (no uploads), or an https:// URL later.
  -- The CHECK refuses javascript: and data: URLs, which an <img src> must
  -- never be given.
  url        text        NOT NULL CHECK ((url ~ '^/[A-Za-z0-9/_.-]+$' OR url ~ '^https://') AND length(url) <= 500),

  -- REQUIRED alt text: a screen-reader user hears "Tan leather loafer,
  -- side view", not "image". The CHECK makes accessibility a rule of the
  -- data, not a hope.
  alt        text        NOT NULL CHECK (length(btrim(alt)) BETWEEN 1 AND 200),

  -- 0 is the main image (product cards). UNIQUE per product so the order
  -- is never ambiguous.
  position   smallint    NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, position)
);
