-- Allow customers to sign in with Google (email) before entering a mobile number on their booking.
ALTER TABLE customers ALTER COLUMN mobile DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers (lower(email)) WHERE email IS NOT NULL;
