-- ARENA11 Platform Upgrade: Customer OTP auth, slot-locked bookings, Razorpay payments, HP reset history, and flexible match timers.

-- 1. Allow any custom match duration from 10 seconds up to 2 hours (7200s).
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_round_seconds_check;
ALTER TABLE matches ADD CONSTRAINT matches_round_seconds_check CHECK (round_seconds BETWEEN 10 AND 7200);

-- 2. HP Reset Audit History
CREATE TABLE hp_history (
  id              bigserial PRIMARY KEY,
  match_id        int NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round           int NOT NULL,
  match_player_id int REFERENCES match_players(id) ON DELETE CASCADE,
  scope           text NOT NULL CHECK (scope IN ('player', 'all')),
  hp_before       int,
  hp_after        int NOT NULL,
  reset_by        int REFERENCES staff_users(id) ON DELETE SET NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hp_history_match ON hp_history (match_id, created_at DESC);

-- 3. Customer Accounts & Mobile OTP Verification (separate from staff_users)
CREATE TABLE customers (
  id            serial PRIMARY KEY,
  mobile        text NOT NULL UNIQUE,
  name          text,
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE customer_otps (
  id         bigserial PRIMARY KEY,
  mobile     text NOT NULL,
  otp_hash   text NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_otps_mobile ON customer_otps (mobile, created_at DESC);

-- 4. Upgrade Bookings with full lifecycle, packages, customer link, and double-booking prevention
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'new', 'pending', 'payment_successful', 'contacted',
    'confirmed', 'cancelled', 'completed', 'refund_pending', 'refunded', 'declined'
  ));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_id int REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS amount_inr int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_key text;

-- Prevent double booking of the same active date+time slot.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_active_unique
  ON bookings (slot_key)
  WHERE slot_key IS NOT NULL AND status IN ('pending', 'payment_successful', 'confirmed', 'completed');

-- 5. Online Payments (Razorpay)
CREATE TABLE payments (
  id           serial PRIMARY KEY,
  booking_id   int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id  int REFERENCES customers(id) ON DELETE SET NULL,
  gateway      text NOT NULL DEFAULT 'razorpay',
  order_id     text NOT NULL UNIQUE,
  payment_id   text UNIQUE,
  signature    text,
  amount_paise int NOT NULL CHECK (amount_paise > 0),
  currency     text NOT NULL DEFAULT 'INR',
  method       text,
  status       text NOT NULL DEFAULT 'created'
               CHECK (status IN ('created', 'paid', 'failed', 'refund_pending', 'refunded')),
  receipt_no   text NOT NULL UNIQUE,
  raw_payload  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking ON payments (booking_id, created_at DESC);
