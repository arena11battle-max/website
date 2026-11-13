-- Booking enquiries can name a game mode and a preferred loadout (picked from the website's cards).
ALTER TABLE bookings
  ADD COLUMN game_mode text CHECK (game_mode IN ('tdm', 'domination', 'last_squad', 'custom')),
  ADD COLUMN loadout   text CHECK (char_length(loadout) <= 40);
