-- ARENA11 public website: booking enquiries, venue settings and the photo gallery.

CREATE TABLE bookings (
  id            serial PRIMARY KEY,
  reference     text NOT NULL UNIQUE,
  name          text NOT NULL,
  phone         text NOT NULL,
  email         text,
  players       int NOT NULL CHECK (players BETWEEN 1 AND 50),
  preferred_date date NOT NULL,
  preferred_time time NOT NULL,
  notes         text,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'confirmed', 'declined', 'cancelled')),
  staff_notes   text,
  handled_by    int REFERENCES staff_users(id) ON DELETE SET NULL,
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_status ON bookings (status, created_at DESC);
CREATE INDEX bookings_date ON bookings (preferred_date);

-- Key/value venue details shown on the website (address, phone, socials...). Values are plain strings.
CREATE TABLE site_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_by  int REFERENCES staff_users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Real photos uploaded by staff. Stored in the database so a pg_dump backs them up too.
CREATE TABLE gallery_media (
  id          serial PRIMARY KEY,
  caption     text NOT NULL,
  category    text NOT NULL CHECK (category IN ('arena', 'arsenal', 'teams', 'gameplay', 'bts')),
  mime        text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes       bytea NOT NULL,
  size        int NOT NULL,
  published   boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 0,
  uploaded_by int REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gallery_published ON gallery_media (published, sort, id DESC);

-- Faster leaderboard and scoreboard aggregation.
CREATE INDEX events_shooter ON events (shooter_mp_id) WHERE NOT voided;
CREATE INDEX matches_finished ON matches (finished_at) WHERE status = 'finished';
CREATE INDEX match_players_player ON match_players (player_id);
