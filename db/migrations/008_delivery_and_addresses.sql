-- 008: where things are delivered, and what that costs.

-- ---------------------------------------------------------------------------
-- delivery_fees: one row per state (36 states + the FCT)
-- ---------------------------------------------------------------------------
-- The ROWS are inserted here, in the migration, not in the seed: they are
-- reference data the app can't work without (addresses.state points at
-- them), so a fresh production database must have them even if nobody
-- runs the demo seed. The fees are a starting point; an admin edits them
-- on /admin/delivery-fees.
CREATE TABLE delivery_fees (
  -- The state's name IS the key: it's short, stable, and it's what the
  -- address form and the API send. A surrogate id would only add a join.
  state      text        PRIMARY KEY CHECK (length(state) BETWEEN 2 AND 40),

  fee_kobo   bigint      NOT NULL CHECK (fee_kobo >= 0 AND fee_kobo <= 100000000),

  -- "Arrives in 2–4 working days". Two numbers rather than text, so the
  -- range is always well-formed (CHECK) and the UI words it consistently.
  min_days   smallint    NOT NULL CHECK (min_days >= 1),
  max_days   smallint    NOT NULL CHECK (max_days <= 30),
  CHECK (max_days >= min_days),

  version    integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER delivery_fees_set_updated_at BEFORE UPDATE ON delivery_fees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- From Aba: Abia itself is cheapest and fastest; the South-East and
-- South-South next; Lagos and the South-West; then the North.
INSERT INTO delivery_fees (state, fee_kobo, min_days, max_days) VALUES
  ('Abia',            150000, 1, 2),
  ('Adamawa',         650000, 4, 7),
  ('Akwa Ibom',       300000, 2, 3),
  ('Anambra',         250000, 1, 3),
  ('Bauchi',          600000, 4, 7),
  ('Bayelsa',         350000, 2, 4),
  ('Benue',           450000, 3, 5),
  ('Borno',           750000, 5, 8),
  ('Cross River',     350000, 2, 4),
  ('Delta',           350000, 2, 4),
  ('Ebonyi',          250000, 1, 3),
  ('Edo',             350000, 2, 4),
  ('Ekiti',           450000, 3, 5),
  ('Enugu',           250000, 1, 3),
  ('FCT',             450000, 2, 4),
  ('Gombe',           600000, 4, 7),
  ('Imo',             200000, 1, 2),
  ('Jigawa',          700000, 4, 7),
  ('Kaduna',          550000, 3, 6),
  ('Kano',            600000, 3, 6),
  ('Katsina',         650000, 4, 7),
  ('Kebbi',           700000, 4, 8),
  ('Kogi',            450000, 3, 5),
  ('Kwara',           500000, 3, 5),
  ('Lagos',           400000, 2, 4),
  ('Nasarawa',        500000, 3, 5),
  ('Niger',           550000, 3, 6),
  ('Ogun',            400000, 2, 4),
  ('Ondo',            400000, 2, 4),
  ('Osun',            450000, 3, 5),
  ('Oyo',             450000, 2, 4),
  ('Plateau',         550000, 3, 6),
  ('Rivers',          250000, 1, 3),
  ('Sokoto',          750000, 5, 8),
  ('Taraba',          700000, 4, 7),
  ('Yobe',            750000, 5, 8),
  ('Zamfara',         750000, 5, 8);

-- ---------------------------------------------------------------------------
-- addresses: a customer's saved delivery addresses
-- ---------------------------------------------------------------------------
CREATE TABLE addresses (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: an address is the customer's own data and means nothing
  -- without them (only demo customers are ever deleted). Orders don't
  -- point here: they COPY the address at checkout (see 012), so deleting or
  -- editing an address never changes where a past order went.
  customer_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- "Home", "Office", "Mum's place". Optional.
  label          text        NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  recipient_name text        NOT NULL CHECK (length(btrim(recipient_name)) BETWEEN 1 AND 100),

  -- The courier calls this number. Stored in one form, +234XXXXXXXXXX
  -- (lib/phone.ts accepts 0803…, +234 803… and so on).
  phone          text        NOT NULL CHECK (phone ~ '^\+234[0-9]{10}$'),

  street         text        NOT NULL CHECK (length(btrim(street)) BETWEEN 3 AND 200),
  city           text        NOT NULL CHECK (length(btrim(city)) BETWEEN 2 AND 80),

  -- A FOREIGN KEY to the fee table, so an address can only name a state we
  -- deliver to (and the fee lookup at checkout can never miss). RESTRICT:
  -- a state can't be removed while addresses use it.
  state          text        NOT NULL REFERENCES delivery_fees (state) ON DELETE RESTRICT,

  -- Nigerian addresses lean on landmarks: "opposite Ariaria market gate".
  landmark       text        NULL CHECK (length(landmark) <= 120),

  is_default     boolean     NOT NULL DEFAULT false,
  version        integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER addresses_set_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- AT MOST ONE DEFAULT PER CUSTOMER, enforced by the database. A PARTIAL
-- unique index only contains rows WHERE is_default, so it says "no two
-- default rows share a customer_id" while any number of non-default rows
-- can. Making another address the default is one transaction that clears
-- the old default first (lib/repos/addresses.ts).
CREATE UNIQUE INDEX addresses_one_default_per_customer ON addresses (customer_id) WHERE is_default;

-- "My addresses", oldest first (the address book order).
CREATE INDEX addresses_customer_idx ON addresses (customer_id, created_at, id);

-- The RESTRICT check when a delivery_fees row is deleted.
CREATE INDEX addresses_state_idx ON addresses (state);
