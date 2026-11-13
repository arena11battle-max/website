-- ALOHA 2026 SRMAP UNIVERSITY event registrations (1 vs 1, Rs. 400) and admin-managed discount coupons.

CREATE TABLE event_coupons (
  id             serial PRIMARY KEY,
  event_slug     text NOT NULL DEFAULT 'aloha-2026',
  code           text NOT NULL UNIQUE,
  discount_type  text NOT NULL CHECK (discount_type IN ('flat', 'percent')),
  discount_value int NOT NULL CHECK (discount_value > 0),
  max_uses       int CHECK (max_uses IS NULL OR max_uses > 0),
  used_count     int NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  active         boolean NOT NULL DEFAULT true,
  created_by     int REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_coupons_slug ON event_coupons (event_slug, active);

CREATE TABLE event_registrations (
  id              serial PRIMARY KEY,
  reference       text NOT NULL UNIQUE,
  event_slug      text NOT NULL DEFAULT 'aloha-2026',
  event_name      text NOT NULL DEFAULT 'ALOHA 2026 SRMAP UNIVERSITY',
  game_mode       text NOT NULL DEFAULT '1 vs 1',
  name            text NOT NULL,
  clg_reg_no      text NOT NULL,
  mobile_number   text NOT NULL,
  email           text NOT NULL,
  base_price      int NOT NULL DEFAULT 400,
  coupon_code     text,
  discount_amount int NOT NULL DEFAULT 0,
  final_price     int NOT NULL,
  ip_hash         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_registrations_slug ON event_registrations (event_slug, created_at DESC);
