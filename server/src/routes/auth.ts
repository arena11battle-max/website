import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import {
  REFRESH_TTL_DAYS,
  dummyPasswordHash,
  hashPassword,
  randomToken,
  sha256,
  signAccessToken,
  verifyPassword,
} from '../security.js';

export const Password = z.string().min(8, 'Password must be at least 8 characters').max(200);
export const Email = z.string().trim().toLowerCase().pipe(z.email());

const REFRESH_COOKIE = 'arena_refresh';

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;

  async function issueSession(reply: FastifyReply, user: { id: number; name: string; email: string; role: 'admin' | 'operator' }) {
    const refresh = randomToken();
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [user.id, sha256(refresh), REFRESH_TTL_DAYS],
    );
    reply.setCookie(REFRESH_COOKIE, refresh, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: REFRESH_TTL_DAYS * 86400,
    });
    return { accessToken: signAccessToken(config.APP_SECRET, { sub: user.id, role: user.role }), user };
  }

  app.get('/status', async () => {
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM staff_users');
    return { needsSetup: rows[0].n === 0 };
  });

  // First run only: creates the owner's admin account. Locked once any staff account exists.
  app.post('/setup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80), email: Email, password: Password }).parse(req.body);
    const hash = await hashPassword(body.password);
    const { rows } = await db.query(
      `INSERT INTO staff_users (name, email, password_hash, role)
       SELECT $1, $2, $3, 'admin' WHERE NOT EXISTS (SELECT 1 FROM staff_users)
       RETURNING id, name, email, role`,
      [body.name, body.email, hash],
    );
    if (!rows[0]) return reply.code(409).send({ error: 'Setup is already done. Please sign in.' });
    req.user = rows[0];
    await app.audit(req, 'setup.admin_created', { email: body.email });
    return issueSession(reply, rows[0]);
  });

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ email: Email, password: z.string().min(1).max(200) }).parse(req.body);
    const { rows } = await db.query(
      'SELECT id, name, email, role, password_hash, active FROM staff_users WHERE email = $1',
      [body.email],
    );
    const u = rows[0];
    const ok = await verifyPassword(u?.password_hash ?? (await dummyPasswordHash()), body.password);
    if (!u || !ok || !u.active) {
      req.log.warn({ email: body.email }, 'failed login');
      return reply.code(401).send({ error: 'Wrong email or password' });
    }
    const user = { id: u.id, name: u.name, email: u.email, role: u.role };
    req.user = user;
    await app.audit(req, 'auth.login');
    return issueSession(reply, user);
  });

  // Swaps a valid refresh cookie for a new access token and a new refresh cookie (the old one is revoked).
  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    // No cookie just means "not signed in on this device", which the app checks on every load.
    if (!token) return reply.code(204).send();
    const { rows } = await db.query(
      `UPDATE refresh_tokens t SET revoked_at = now()
         FROM staff_users u
        WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
          AND u.id = t.user_id AND u.active
        RETURNING u.id, u.name, u.email, u.role`,
      [sha256(token)],
    );
    if (!rows[0]) {
      // A revoked token being replayed means it was copied: end every session of that user.
      const reused = await db.query<{ user_id: number }>(
        'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL',
        [sha256(token)],
      );
      if (reused.rows[0]) {
        await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [reused.rows[0].user_id]);
        await db.query('INSERT INTO audit_log (user_id, action) VALUES ($1, $2)', [reused.rows[0].user_id, 'auth.refresh_reuse_detected']);
      }
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
    }
    return issueSession(reply, rows[0]);
  });

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(token)]);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => ({ user: req.user }));

  // Sign out on every device, including this one.
  app.post('/sessions/revoke', { preHandler: app.authenticate }, async (req, reply) => {
    const { rowCount } = await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user!.id]);
    await app.audit(req, 'auth.sessions_revoked', { count: rowCount });
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { revoked: rowCount };
  });

  app.post('/password', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ current: z.string().min(1), next: Password }).parse(req.body);
    const { rows } = await db.query('SELECT password_hash FROM staff_users WHERE id = $1', [req.user!.id]);
    if (!(await verifyPassword(rows[0].password_hash, body.current)))
      return reply.code(400).send({ error: 'Current password is wrong' });
    await db.query('UPDATE staff_users SET password_hash = $2 WHERE id = $1', [req.user!.id, await hashPassword(body.next)]);
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user!.id]);
    await app.audit(req, 'auth.password_changed');
    return issueSession(reply, req.user!);
  });
};

export default routes;
