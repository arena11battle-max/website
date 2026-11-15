import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://arena:arena@localhost:5432/arena'),
  // Used to sign login tokens and to encrypt device secrets. Must be long and random in production.
  APP_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  // Comma separated list of extra browser origins allowed to call the API (the app's own origin is always allowed).
  CORS_ORIGINS: z.string().default(''),
  // Set to true when the app is served over HTTPS so cookies are marked Secure.
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MIN_PLAYERS: z.coerce.number().int().default(2),
  MAX_PLAYERS: z.coerce.number().int().default(8),
  // Seconds a player stays dead after a kill if the hub never reports the respawn.
  RESPAWN_SECONDS: z.coerce.number().int().default(8),
  // Venue time zone, used for "today" on the leaderboard.
  TIME_ZONE: z.string().default('Asia/Kolkata'),
  WEB_DIST: z.string().default('../web/dist'),
  // Online payments (Razorpay). Leave empty in development to use the built-in test checkout.
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  // Customer Mobile OTP settings
  OTP_EXPIRY_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
});

const parsed = Env.parse(process.env);

if (parsed.NODE_ENV === 'production') {
  const weak = /^(dev-only|change-me)/i.test(parsed.APP_SECRET) || parsed.APP_SECRET.length < 32;
  if (weak) throw new Error('APP_SECRET must be a random value of at least 32 characters in production');
  if (/change-me/i.test(parsed.DATABASE_URL)) throw new Error('Set DB_PASSWORD to a real password before running in production');
  if (parsed.MAX_PLAYERS < parsed.MIN_PLAYERS) throw new Error('MAX_PLAYERS must be at least MIN_PLAYERS');
}

export const config = parsed;

// Kit gun slots. Slot numbers match the firmware gun types (0 pistol, 1 rifle, 2 SMG, 3 AWM);
// ARENA11 runs two rifles and two SMGs, so the names and damage here are what the game uses.
// The server is the referee: damage always comes from this table, whatever the hardware reports.
export const GUNS = [
  { id: 0, name: 'UMP45', damage: 15 },
  { id: 1, name: 'AR15', damage: 25 },
  { id: 2, name: 'Vector', damage: 15 },
  { id: 3, name: 'Tactical M4', damage: 25 },
] as const;

export const MAX_HP = 100;
