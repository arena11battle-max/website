import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { encryptSecret, hashPassword, randomToken } from '../security.js';
import { Email, Password } from './auth.js';

const Id = z.object({ id: z.coerce.number().int().positive() });

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;

  // Kits can be read by any staff member (needed to set up a match); everything else here is admin only.
  app.get('/kits', { preHandler: app.authenticate }, async () => {
    const { rows } = await db.query('SELECT id, label, team, gun, active FROM kits ORDER BY team DESC, label');
    return { kits: rows };
  });

  app.register(async (admin) => {
    admin.addHook('preHandler', app.requireRole('admin'));

    // ---- Staff accounts ----
    admin.get('/staff', async () => {
      const { rows } = await db.query(
        `SELECT s.id, s.name, s.email, s.role, s.active, s.created_at AS "createdAt",
                (SELECT count(*)::int FROM refresh_tokens t WHERE t.user_id = s.id AND t.revoked_at IS NULL AND t.expires_at > now()) AS sessions
           FROM staff_users s ORDER BY s.id`,
      );
      return { staff: rows };
    });

    admin.post('/staff', async (req, reply) => {
      const body = z
        .object({ name: z.string().trim().min(1).max(80), email: Email, password: Password, role: z.enum(['admin', 'operator']) })
        .parse(req.body);
      const { rows } = await db.query(
        `INSERT INTO staff_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role, active, created_at AS "createdAt"`,
        [body.name, body.email, await hashPassword(body.password), body.role],
      );
      await app.audit(req, 'staff.created', { id: rows[0].id, role: body.role });
      return reply.code(201).send({ staff: rows[0] });
    });

    admin.patch('/staff/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          role: z.enum(['admin', 'operator']).optional(),
          active: z.boolean().optional(),
          password: Password.optional(),
        })
        .parse(req.body);
      if (id === req.user!.id && (body.active === false || body.role === 'operator'))
        return reply.code(400).send({ error: "You can't disable or demote your own account" });
      const { rows } = await db.query(
        `UPDATE staff_users SET name = COALESCE($2, name), role = COALESCE($3, role), active = COALESCE($4, active),
                password_hash = COALESCE($5, password_hash)
          WHERE id = $1 RETURNING id, name, email, role, active, created_at AS "createdAt"`,
        [id, body.name ?? null, body.role ?? null, body.active ?? null, body.password ? await hashPassword(body.password) : null],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Staff member not found' });
      if (body.active === false || body.password)
        await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await app.audit(req, 'staff.updated', { id, ...body, password: body.password ? 'changed' : undefined });
      return { staff: rows[0] };
    });

    admin.post('/staff/:id/revoke', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const { rowCount } = await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await app.audit(req, 'staff.sessions_revoked', { id, count: rowCount });
      return reply.send({ revoked: rowCount });
    });

    // ---- Kits ----
    const KitBody = z.object({
      label: z.string().trim().toUpperCase().regex(/^[RB]\d{1,2}$/, 'Label is R or B plus the player number, e.g. R3'),
      gun: z.number().int().min(0).max(3),
      active: z.boolean().optional(),
    });
    const teamOf = (label: string) => (label.startsWith('R') ? 'red' : 'blue');

    admin.post('/kits', async (req, reply) => {
      const body = KitBody.parse(req.body);
      const { rows } = await db.query(
        'INSERT INTO kits (label, team, gun, active) VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING id, label, team, gun, active',
        [body.label, teamOf(body.label), body.gun, body.active ?? null],
      );
      await app.audit(req, 'kit.created', rows[0]);
      return reply.code(201).send({ kit: rows[0] });
    });

    admin.patch('/kits/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = KitBody.partial().parse(req.body);
      const { rows } = await db.query(
        `UPDATE kits SET label = COALESCE($2, label), team = COALESCE($3, team), gun = COALESCE($4, gun), active = COALESCE($5, active)
          WHERE id = $1 RETURNING id, label, team, gun, active`,
        [id, body.label ?? null, body.label ? teamOf(body.label) : null, body.gun ?? null, body.active ?? null],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Kit not found' });
      await app.audit(req, 'kit.updated', rows[0]);
      return { kit: rows[0] };
    });

    // ---- Devices (scoreboard hub / bridge) ----
    admin.get('/devices', async () => {
      const { rows } = await db.query(
        'SELECT id, name, active, last_seen_at AS "lastSeenAt", created_at AS "createdAt" FROM devices ORDER BY id',
      );
      return { devices: rows };
    });

    // The secret is returned once, here, and never again.
    admin.post('/devices', async (req, reply) => {
      const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
      const secret = randomToken(32);
      const { rows } = await db.query(
        'INSERT INTO devices (name, secret_enc) VALUES ($1, $2) RETURNING id, name, active, created_at AS "createdAt"',
        [body.name, encryptSecret(config.APP_SECRET, secret)],
      );
      await app.audit(req, 'device.created', { id: rows[0].id });
      return reply.code(201).send({ device: rows[0], secret });
    });

    admin.post('/devices/:id/rotate', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const secret = randomToken(32);
      const { rowCount } = await db.query('UPDATE devices SET secret_enc = $2 WHERE id = $1', [id, encryptSecret(config.APP_SECRET, secret)]);
      if (!rowCount) return reply.code(404).send({ error: 'Device not found' });
      await app.audit(req, 'device.rotated', { id });
      return { id, secret };
    });

    admin.patch('/devices/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = z.object({ active: z.boolean() }).parse(req.body);
      const { rows } = await db.query('UPDATE devices SET active = $2 WHERE id = $1 RETURNING id, name, active', [id, body.active]);
      if (!rows[0]) return reply.code(404).send({ error: 'Device not found' });
      await app.audit(req, 'device.updated', { id, active: body.active });
      return { device: rows[0] };
    });

    admin.get('/audit', async () => {
      const { rows } = await db.query(
        `SELECT a.id, a.action, a.detail, a.created_at AS "createdAt", s.name AS "user"
           FROM audit_log a LEFT JOIN staff_users s ON s.id = a.user_id ORDER BY a.id DESC LIMIT 200`,
      );
      return { audit: rows };
    });
  });
};

export default routes;
