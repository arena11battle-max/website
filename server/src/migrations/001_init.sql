CREATE TABLE staff_users (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'operator')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          bigserial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  nickname    text,
  phone       text,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One kit = one gun + vest pair, flashed with a fixed TEAM and PLAYER_ID (label R1, B3...).
CREATE TABLE kits (
  id          serial PRIMARY KEY,
  label       text NOT NULL UNIQUE,
  team        text NOT NULL CHECK (team IN ('red', 'blue')),
  gun         int NOT NULL DEFAULT 1 CHECK (gun BETWEEN 0 AND 3),
  active      boolean NOT NULL DEFAULT true
);

-- Scoreboard hubs / bridges allowed to post hit events. Secret is AES-GCM encrypted.
CREATE TABLE devices (
  id            serial PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  secret_enc    text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id                  serial PRIMARY KEY,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'setup'
                      CHECK (status IN ('setup', 'live', 'break', 'paused', 'finished')),
  rounds              int NOT NULL CHECK (rounds BETWEEN 1 AND 10),
  round_seconds       int NOT NULL CHECK (round_seconds BETWEEN 30 AND 3600),
  break_seconds       int NOT NULL CHECK (break_seconds BETWEEN 0 AND 1800),
  current_round       int NOT NULL DEFAULT 0,
  phase_ends_at       timestamptz,
  paused_status       text,
  paused_remaining_ms int,
  winner              text,
  created_by          int REFERENCES staff_users(id),
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Only one match can be running in the arena at a time.
CREATE UNIQUE INDEX one_running_match ON matches ((true)) WHERE status IN ('live', 'break', 'paused');

CREATE TABLE match_players (
  id          serial PRIMARY KEY,
  match_id    int NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id   int NOT NULL REFERENCES players(id),
  team        text NOT NULL CHECK (team IN ('red', 'blue')),
  kit_id      int NOT NULL REFERENCES kits(id),
  UNIQUE (match_id, player_id),
  UNIQUE (match_id, kit_id)
);

CREATE TABLE events (
  id              bigserial PRIMARY KEY,
  match_id        int NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round           int NOT NULL,
  type            text NOT NULL CHECK (type IN ('hit', 'kill', 'respawn')),
  shooter_mp_id   int REFERENCES match_players(id) ON DELETE CASCADE,
  victim_mp_id    int NOT NULL REFERENCES match_players(id) ON DELETE CASCADE,
  gun             int,
  damage          int NOT NULL DEFAULT 0,
  victim_hp_after int NOT NULL,
  source          text NOT NULL CHECK (source IN ('device', 'manual', 'simulator')),
  device_id       int REFERENCES devices(id),
  device_seq      int,
  voided          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_match_round ON events (match_id, round);
CREATE INDEX events_victim ON events (victim_mp_id, created_at DESC);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     int REFERENCES staff_users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Ten kits to match the arena's ten guns. Edit them under Settings > Kits.
INSERT INTO kits (label, team, gun) VALUES
  ('R1', 'red', 1), ('R2', 'red', 1), ('R3', 'red', 2), ('R4', 'red', 0), ('R5', 'red', 3),
  ('B1', 'blue', 1), ('B2', 'blue', 1), ('B3', 'blue', 2), ('B4', 'blue', 0), ('B5', 'blue', 3);
