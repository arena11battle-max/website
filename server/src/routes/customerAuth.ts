import crypto from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';

export interface CustomerUser {
  id: number;
  mobile: string;
  name: string | null;
  email: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    customer?: CustomerUser;
  }
}

function customerSecret() {
  return crypto.createHmac('sha256', config.APP_SECRET).update('customer-auth-v1').digest('hex');
}

export function signCustomerToken(customerId: number, mobile: string): string {
  return jwt.sign({ sub: customerId, mobile, kind: 'customer' }, customerSecret(), { expiresIn: '7d' });
}

export function verifyCustomerToken(token: string): { sub: number; mobile: string } | null {
  try {
    const p = jwt.verify(token, customerSecret()) as jwt.JwtPayload & { sub?: unknown; mobile?: unknown; kind?: unknown };
    if (p.kind !== 'customer' || typeof p.sub !== 'number' || typeof p.mobile !== 'string') return null;
    return { sub: p.sub, mobile: p.mobile };
  } catch {
    return null;
  }
}

export function normalizeIndianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let ten = '';
  if (/^[6-9]\d{9}$/.test(digits)) ten = digits;
  else if (/^0[6-9]\d{9}$/.test(digits)) ten = digits.slice(1);
  else if (/^91[6-9]\d{9}$/.test(digits)) ten = digits.slice(2);
  else return null;
  return `+91${ten}`;
}

function hashOtp(mobile: string, otp: string): string {
  return crypto.createHmac('sha256', config.APP_SECRET).update(`otp:${mobile}:${otp}`).digest('hex');
}

export function makeCustomerAuth(db: import('../db.js').Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
    const claims = token ? verifyCustomerToken(token) : null;
    if (!claims) return reply.code(401).send({ error: 'Please verify your mobile number to continue' });
    const { rows } = await db.query<CustomerUser>('SELECT id, mobile, name, email FROM customers WHERE id = $1', [claims.sub]);
    if (!rows[0]) return reply.code(401).send({ error: 'Customer account not found' });
    req.customer = rows[0];
  };
}

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;
  const requireCustomer = makeCustomerAuth(db);

  app.post(
    '/customer/auth/send-otp',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { mobile: raw } = z.object({ mobile: z.string().trim().min(10).max(20) }).parse(req.body);
      const mobile = normalizeIndianMobile(raw);
      if (!mobile) return reply.code(400).send({ error: 'Enter a valid 10-digit Indian mobile number (+91)' });

      // Enforce resend cooldown
      const { rows: recent } = await db.query<{ created_at: Date }>(
        `SELECT created_at FROM customer_otps WHERE mobile = $1 ORDER BY id DESC LIMIT 1`,
        [mobile],
      );
      if (recent[0]) {
        const elapsedSec = (Date.now() - recent[0].created_at.getTime()) / 1000;
        if (elapsedSec < config.OTP_RESEND_COOLDOWN_SECONDS) {
          const wait = Math.ceil(config.OTP_RESEND_COOLDOWN_SECONDS - elapsedSec);
          return reply.code(429).send({ error: `Please wait ${wait}s before requesting another OTP`, retryAfterSeconds: wait });
        }
      }

      const otp = String(crypto.randomInt(100000, 1000000));
      const otpHash = hashOtp(mobile, otp);
      await db.query(
        `INSERT INTO customer_otps (mobile, otp_hash, expires_at)
         VALUES ($1, $2, now() + make_interval(secs => $3))`,
        [mobile, otpHash, config.OTP_EXPIRY_SECONDS],
      );

      req.log.info({ mobile, otp: config.NODE_ENV === 'production' ? '[redacted]' : otp }, 'customer OTP issued');

      return {
        ok: true,
        mobile,
        expiresInSeconds: config.OTP_EXPIRY_SECONDS,
        cooldownSeconds: config.OTP_RESEND_COOLDOWN_SECONDS,
        ...(config.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
      };
    },
  );

  app.post(
    '/customer/auth/verify-otp',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = z
        .object({
          mobile: z.string().trim().min(10).max(20),
          otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
          name: z.string().trim().min(2).max(80).optional(),
          email: z.email().max(120).optional(),
        })
        .parse(req.body);

      const mobile = normalizeIndianMobile(body.mobile);
      if (!mobile) return reply.code(400).send({ error: 'Invalid mobile number' });

      const { rows: otps } = await db.query<{ id: number; otp_hash: string; attempts: number; expires_at: Date; used_at: Date | null }>(
        `SELECT id, otp_hash, attempts, expires_at, used_at
           FROM customer_otps
          WHERE mobile = $1
          ORDER BY id DESC LIMIT 1`,
        [mobile],
      );
      const row = otps[0];
      if (!row || row.used_at) return reply.code(400).send({ error: 'No active OTP found. Request a new OTP.' });
      if (row.expires_at.getTime() < Date.now()) return reply.code(400).send({ error: 'OTP expired. Request a new OTP.' });
      if (row.attempts >= 5) return reply.code(429).send({ error: 'Too many incorrect attempts. Request a new OTP.' });

      const expected = Buffer.from(row.otp_hash, 'hex');
      const actual = Buffer.from(hashOtp(mobile, body.otp), 'hex');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        await db.query('UPDATE customer_otps SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        return reply.code(401).send({ error: 'Incorrect OTP' });
      }

      await db.query('UPDATE customer_otps SET used_at = now() WHERE id = $1', [row.id]);

      const { rows: custRows } = await db.query<CustomerUser>(
        `INSERT INTO customers (mobile, name, email, last_login_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (mobile) DO UPDATE
           SET name = COALESCE($2, customers.name),
               email = COALESCE($3, customers.email),
               last_login_at = now()
         RETURNING id, mobile, name, email`,
        [mobile, body.name ?? null, body.email ?? null],
      );

      const customer = custRows[0];
      const token = signCustomerToken(customer.id, customer.mobile);
      return { customer, token };
    },
  );

  app.get('/customer/me', { preHandler: requireCustomer }, async (req) => {
    const { rows: bookings } = await db.query(
      `SELECT b.id, b.reference, b.package_id AS "packageId", b.package_name AS "packageName",
              b.players, to_char(b.preferred_date, 'YYYY-MM-DD') AS date, to_char(b.preferred_time, 'HH24:MI') AS time,
              b.amount_inr AS "amountInr", b.status, b.created_at AS "createdAt",
              p.receipt_no AS "receiptNo", p.payment_id AS "paymentId", p.status AS "paymentStatus", p.method AS "paymentMethod"
         FROM bookings b
         LEFT JOIN LATERAL (
           SELECT receipt_no, payment_id, status, method FROM payments WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
         ) p ON true
        WHERE b.customer_id = $1
        ORDER BY b.id DESC
        LIMIT 50`,
      [req.customer!.id],
    );
    return { customer: req.customer, bookings };
  });
};

export default routes;
