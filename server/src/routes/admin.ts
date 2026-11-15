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

    // ---- Admin Dashboard Metrics ----
    admin.get('/dashboard', async () => {
      const [matchesAgg, bookingsAgg, playersAgg, revToday, pendingPay, recentMatches, playerStats] = await Promise.all([
        db.query<{ total: number; completed: number }>(
          `SELECT count(*) FILTER (WHERE status <> 'setup')::int AS total,
                  count(*) FILTER (WHERE status = 'finished')::int AS completed
             FROM matches`,
        ),
        db.query<{ total: number }>(`SELECT count(*)::int AS total FROM bookings`),
        db.query<{ total: number }>(`SELECT count(*)::int AS total FROM players WHERE NOT archived`),
        db.query<{ total_inr: number }>(
          `SELECT (
             COALESCE((SELECT sum(amount_paise) / 100 FROM payments WHERE status = 'paid' AND (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date), 0)
             + COALESCE((SELECT sum(final_price) FROM event_registrations WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date), 0)
           )::int AS total_inr`,
          [config.TIME_ZONE],
        ),
        db.query<{ count: number; amount_inr: number }>(
          `SELECT count(*)::int AS count, COALESCE(sum(amount_inr), 0)::int AS amount_inr
             FROM bookings WHERE status IN ('pending', 'new')`,
        ),
        db.query(
          `SELECT m.id, m.name, m.status, m.winner, m.rounds, m.round_seconds AS "roundSeconds",
                  m.started_at AS "startedAt", m.finished_at AS "finishedAt",
                  (SELECT count(*)::int FROM events e JOIN match_players s ON s.id = e.shooter_mp_id
                    WHERE e.match_id = m.id AND e.type = 'kill' AND s.team = 'red' AND NOT e.voided) AS "redScore",
                  (SELECT count(*)::int FROM events e JOIN match_players s ON s.id = e.shooter_mp_id
                    WHERE e.match_id = m.id AND e.type = 'kill' AND s.team = 'blue' AND NOT e.voided) AS "blueScore"
             FROM matches m
            WHERE m.status <> 'setup'
            ORDER BY m.id DESC
            LIMIT 10`,
        ),
        db.query(
          `SELECT p.id, COALESCE(NULLIF(p.nickname, ''), p.name) AS "displayName", p.name,
                  count(DISTINCT mp.match_id)::int AS matches,
                  count(e.id) FILTER (WHERE e.type = 'kill' AND e.shooter_mp_id = mp.id)::int AS kills,
                  count(e.id) FILTER (WHERE e.type = 'kill' AND e.victim_mp_id = mp.id)::int AS deaths,
                  COALESCE(sum(e.damage) FILTER (WHERE e.shooter_mp_id = mp.id), 0)::int AS "damageDealt"
             FROM players p
             JOIN match_players mp ON mp.player_id = p.id
             JOIN matches m ON m.id = mp.match_id AND m.status = 'finished'
             LEFT JOIN events e ON e.match_id = mp.match_id AND NOT e.voided
                               AND (e.shooter_mp_id = mp.id OR e.victim_mp_id = mp.id)
            WHERE NOT p.archived
            GROUP BY p.id
            ORDER BY kills DESC, "damageDealt" DESC
            LIMIT 15`,
        ),
      ]);

      return {
        totalMatchesPlayed: matchesAgg.rows[0]?.total ?? 0,
        completedMatches: matchesAgg.rows[0]?.completed ?? 0,
        totalBookings: bookingsAgg.rows[0]?.total ?? 0,
        todayRevenue: revToday.rows[0]?.total_inr ?? 0,
        pendingPayments: {
          count: pendingPay.rows[0]?.count ?? 0,
          amountInr: pendingPay.rows[0]?.amount_inr ?? 0,
        },
        totalPlayers: playersAgg.rows[0]?.total ?? 0,
        recentMatches: recentMatches.rows,
        playerStats: playerStats.rows,
      };
    });
  });
};

export default routes;
