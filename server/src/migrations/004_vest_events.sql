-- Vests connected over Bluetooth to the staff console report hits themselves.
-- Their guns may not send a player ID yet, so a vest hit can have no shooter; zone says where it landed.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;
ALTER TABLE events ADD CONSTRAINT events_source_check CHECK (source IN ('device', 'manual', 'simulator', 'vest'));
ALTER TABLE events ADD COLUMN zone text CHECK (zone IN ('body', 'head'));
