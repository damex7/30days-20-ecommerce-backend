-- 006: from Day 17's "user / admin" to a shop's three kinds of account,
-- plus demo accounts for portfolio visitors.
--
-- Migrations 001-005 are Day 17's auth tables, copied unchanged. Applied
-- migrations are history, so the changes for this app go in a NEW file
-- rather than edits to the old ones: a database that already ran 001-005
-- ends up exactly like a fresh one.

-- ROLES
--   customer : anyone who signs up. Keeps a cart, addresses and their OWN orders.
--   staff    : created by an admin. Manages products, stock and orders.
--   admin    : everything staff can do, plus users, roles, coupons,
--              delivery fees and API keys.
-- Sign-up always creates a customer (the column default AND the INSERT in
-- lib/users.ts say so), so nobody can sign themselves up as staff by
-- adding role=admin to the form or the JSON body.
--
-- Drop the old CHECK first, move existing rows over, then add the new
-- CHECK, so no row is ever invalid. (users_role_check is the name
-- PostgreSQL gave the inline CHECK in 001.)
ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role = 'customer' WHERE role = 'user';
ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'customer',
  ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'staff', 'admin'));

ALTER TABLE users
  -- A Nigerian mobile number in +234 form (lib/phone.ts normalises it), so
  -- the courier can call about a delivery. NULL means "not given".
  ADD COLUMN phone text NULL CHECK (phone ~ '^\+234[0-9]{10}$'),

  -- Set when an admin creates a staff account with a temporary password
  -- (Day 18). Until they pick their own, every page sends them to
  -- /account/password: the admin saw the temporary one.
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,

  -- DEACTIVATED, not deleted (Day 18). Orders, order events and API keys
  -- point at users, and the shop's history (who bought what, who shipped
  -- it) must survive someone leaving. Sessions are deleted in the same
  -- statement and readSession ignores deactivated users.
  ADD COLUMN deactivated_at timestamptz NULL,

  -- DEMO ACCOUNTS (DEMO_MODE=true only). A demo customer is a fresh,
  -- throwaway account made by one click on the login page, deleted after
  -- 24 hours by the daily cron. Demo staff and demo admin are two shared
  -- seeded accounts that may LOOK at everything but change nothing
  -- (lib/services/permissions.ts). A column rather than a magic email
  -- domain, so every rule asks one clear question: "is this a demo?".
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Demo accounts have NO password at all: they can only be entered through
-- the "Explore the demo" buttons, so nobody can lock others out by
-- changing a shared password, or guess one. Every other account must have
-- an argon2id hash. Two CHECKs, each with a clear name:
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_password_hash_check;
ALTER TABLE users
  ADD CONSTRAINT users_password_hash_check CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
  ADD CONSTRAINT users_password_required CHECK (is_demo OR password_hash IS NOT NULL);

-- The cron's cleanup asks "demo customers created over 24 hours ago". A
-- PARTIAL index holds only demo rows, so it stays tiny however many real
-- customers sign up.
CREATE INDEX users_demo_created_idx ON users (created_at) WHERE is_demo;

-- New audit event types: admin-created accounts, (de)activation, and a
-- demo session starting. The old types stay in the list, so existing rows
-- remain valid.
ALTER TABLE auth_events DROP CONSTRAINT auth_events_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_type_check CHECK (type IN (
  'signed_up', 'email_verified', 'logged_in', 'login_failed', 'logged_out',
  'password_changed', 'password_reset_requested', 'password_reset',
  'session_revoked', 'role_changed', 'profile_updated', 'account_deleted',
  'user_created', 'user_deactivated', 'user_reactivated', 'demo_started'
));
