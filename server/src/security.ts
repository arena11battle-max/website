import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

export type Role = 'admin' | 'operator';
export interface AccessClaims {
  sub: number;
  role: Role;
}

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 14;

export function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

// A real hash to compare against when the email is unknown, so login timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash() {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

export function signAccessToken(secret: string, claims: AccessClaims) {
  return jwt.sign({ role: claims.role }, secret, {
    subject: String(claims.sub),
    expiresIn: ACCESS_TTL_SECONDS,
    algorithm: 'HS256',
    audience: 'arena-staff',
  });
}

export function verifyAccessToken(secret: string, token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'arena-staff' }) as jwt.JwtPayload;
    return { sub: Number(payload.sub), role: payload.role as Role };
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deviceKey(appSecret: string) {
  return crypto.createHash('sha256').update(`device-secret:${appSecret}`).digest();
}

export function encryptSecret(appSecret: string, plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deviceKey(appSecret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(appSecret: string, stored: string) {
  const [iv, tag, enc] = stored.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deviceKey(appSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Device requests are signed as hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`). */
export function signDeviceRequest(secret: string, timestamp: string, rawBody: string) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}
