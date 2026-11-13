import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const PlayerBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  nickname: z.string().trim().max(24).optional().nullable().transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, 'Phone can only contain digits, spaces, + and -')
    .optional()
    .nullable()
    .transform((v) => v || null),
});

const Id = z.object({ id: z.coerce.number().int().positive() });

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const q = z.object({ q: z.string().trim().max(80).optional(), archived: z.enum(['true', 'false']).optional() }).parse(req.query);
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.nickname, p.phone, p.archived, p.created_at AS "createdAt",
              count(DISTINCT mp.match_id)::int AS matches,
              (SELECT count(*)::int FROM events e JOIN match_players x ON x.id = e.shooter_mp_id
                WHERE x.player_id = p.id AND e.type = 'kill' AND NOT e.voided) AS kills
         FROM players p LEFT JOIN match_players mp ON mp.player_id = p.id
        WHERE p.archived = $1
          AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%' OR p.nickname ILIKE '%' || $2 || '%' OR p.phone LIKE '%' || $2 || '%')
        GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`,
      [q.archived === 'true', q.q || null],
    );
    return { players: rows };
  });

  app.post('/', async (req, reply) => {
    const body = PlayerBody.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO players (name, nickname, phone) VALUES ($1, $2, $3)
       RETURNING id, name, nickname, phone, archived, created_at AS "createdAt"`,
      [body.name, body.nickname, body.phone],
    );
    await app.audit(req, 'player.created', { id: rows[0].id });
    return reply.code(201).send({ player: rows[0] });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const { rows } = await db.query(
      'SELECT id, name, nickname, phone, archived, created_at AS "createdAt" FROM players WHERE id = $1',
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Player not found' });
    const { rows: history } = await db.query(
      `SELECT m.id AS "matchId", m.name, m.status, m.winner, mp.team, m.created_at AS "createdAt",
              (SELECT count(*)::int FROM events e WHERE e.shooter_mp_id = mp.id AND e.type = 'kill' AND NOT e.voided) AS kills,
              (SELECT count(*)::int FROM events e WHERE e.victim_mp_id = mp.id AND e.type = 'kill' AND NOT e.voided) AS deaths,
              (SELECT count(*)::int FROM events e WHERE e.shooter_mp_id = mp.id AND e.type IN ('hit','kill') AND NOT e.voided) AS hits,
              (SELECT COALESCE(sum(damage), 0)::int FROM events e WHERE e.shooter_mp_id = mp.id AND NOT e.voided) AS damage
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = $1 ORDER BY m.created_at DESC LIMIT 100`,
      [id],
    );
    const totals = history.reduce(
      (t, h) => ({
        matches: t.matches + 1,
        wins: t.wins + (h.winner === h.team ? 1 : 0),
        kills: t.kills + h.kills,
        deaths: t.deaths + h.deaths,
        hits: t.hits + h.hits,
        damage: t.damage + h.damage,
      }),
      { matches: 0, wins: 0, kills: 0, deaths: 0, hits: 0, damage: 0 },
    );
    return { player: rows[0], totals, history };
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const body = PlayerBody.partial().extend({ archived: z.boolean().optional() }).parse(req.body);
    const { rows } = await db.query(
      `UPDATE players SET
          name = COALESCE($2, name),
          nickname = CASE WHEN $3::boolean THEN $4 ELSE nickname END,
          phone = CASE WHEN $5::boolean THEN $6 ELSE phone END,
          archived = COALESCE($7, archived)
        WHERE id = $1
        RETURNING id, name, nickname, phone, archived, created_at AS "createdAt"`,
      [id, body.name ?? null, 'nickname' in body, body.nickname ?? null, 'phone' in body, body.phone ?? null, body.archived ?? null],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Player not found' });
    await app.audit(req, 'player.updated', { id });
    return { player: rows[0] };
  });
};

export default routes;
