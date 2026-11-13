import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { tx } from '../db.js';
import { control, getMatch, recordEvent, scoreboard, voidEvent, GameError, type Control } from '../game.js';

export function parseVestLine(line: string): { type: 'hit' | 'kill' | 'respawn'; from?: string; zone?: 'body' | 'head' } | null {
  const parts = line.trim().toUpperCase().split(',');
  if (parts[0] === 'P') return { type: 'respawn' };
  if ((parts[0] !== 'H' && parts[0] !== 'K') || !parts[1]) return null;
  const type = parts[0] === 'K' ? 'kill' : 'hit';
  if (parts[1] === 'GEL') return { type, zone: 'body' };
  if (parts[1] === 'HEAD') return { type, zone: 'head' };
  if (/^[RB]\d{1,2}$/.test(parts[1])) return { type, from: parts[1] };
  return null;
}

const Id = z.object({ id: z.coerce.number().int().positive() });

const Settings = z.object({
  name: z.string().trim().max(60).optional(),
  rounds: z.number().int().min(1).max(10).default(3),
  roundSeconds: z.number().int().min(30).max(3600).default(480),
  breakSeconds: z.number().int().min(0).max(1800).default(120),
});

const Lineup = z
  .array(z.object({ playerId: z.number().int().positive(), team: z.enum(['red', 'blue']), kitId: z.number().int().positive() }))
  .superRefine((ps, ctx) => {
    if (ps.length < config.MIN_PLAYERS || ps.length > config.MAX_PLAYERS)
      ctx.addIssue({ code: 'custom', message: `A match needs ${config.MIN_PLAYERS} to ${config.MAX_PLAYERS} players` });
    if (!ps.some((p) => p.team === 'red') || !ps.some((p) => p.team === 'blue'))
      ctx.addIssue({ code: 'custom', message: 'Each team needs at least one player' });
    if (new Set(ps.map((p) => p.playerId)).size !== ps.length) ctx.addIssue({ code: 'custom', message: 'A player is listed twice' });
    if (new Set(ps.map((p) => p.kitId)).size !== ps.length) ctx.addIssue({ code: 'custom', message: 'A kit is given to two players' });
  });

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;
  const gameOpts = { respawnSeconds: config.RESPAWN_SECONDS };
  app.addHook('preHandler', app.authenticate);

  async function saveLineup(c: import('pg').PoolClient, matchId: number, lineup: z.infer<typeof Lineup>) {
    const { rows: kits } = await c.query<{ id: number; label: string; team: string; active: boolean }>(
      'SELECT id, label, team, active FROM kits WHERE id = ANY($1::int[])',
      [lineup.map((p) => p.kitId)],
    );
    const { rows: players } = await c.query<{ id: number; archived: boolean }>('SELECT id, archived FROM players WHERE id = ANY($1::int[])', [
      lineup.map((p) => p.playerId),
    ]);
    for (const p of lineup) {
      const kit = kits.find((k) => k.id === p.kitId);
      if (!kit || !kit.active) throw new GameError(400, 'One of the kits is missing or disabled');
      // A kit's team is flashed into its firmware, so it can only be used on that team.
      if (kit.team !== p.team) throw new GameError(400, `Kit ${kit.label} is a ${kit.team} kit`);
      const player = players.find((x) => x.id === p.playerId);
      if (!player || player.archived) throw new GameError(400, 'One of the players is missing or archived');
    }
    await c.query('DELETE FROM match_players WHERE match_id = $1', [matchId]);
    for (const p of lineup)
      await c.query('INSERT INTO match_players (match_id, player_id, team, kit_id) VALUES ($1, $2, $3, $4)', [
        matchId,
        p.playerId,
        p.team,
        p.kitId,
      ]);
  }

  app.get('/matches', async (req) => {
    const q = z
      .object({ status: z.enum(['setup', 'live', 'break', 'paused', 'finished', 'running']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    const statuses = q.status === 'running' ? ['live', 'break', 'paused'] : q.status ? [q.status] : null;
    const { rows } = await db.query(
      `SELECT m.id, m.name, m.status, m.rounds, m.round_seconds AS "roundSeconds", m.break_seconds AS "breakSeconds",
              m.current_round AS "currentRound", m.winner, m.created_at AS "createdAt", m.started_at AS "startedAt",
              m.finished_at AS "finishedAt",
              count(mp.id)::int AS players,
              (SELECT count(*)::int FROM events e JOIN match_players s ON s.id = e.shooter_mp_id
                WHERE e.match_id = m.id AND e.type = 'kill' AND s.team = 'red' AND NOT e.voided) AS "redScore",
              (SELECT count(*)::int FROM events e JOIN match_players s ON s.id = e.shooter_mp_id
                WHERE e.match_id = m.id AND e.type = 'kill' AND s.team = 'blue' AND NOT e.voided) AS "blueScore"
         FROM matches m LEFT JOIN match_players mp ON mp.match_id = m.id
        WHERE $1::text[] IS NULL OR m.status = ANY($1)
        GROUP BY m.id ORDER BY m.id DESC LIMIT $2`,
      [statuses, q.limit],
    );
    return { matches: rows };
  });

  app.post('/matches', async (req, reply) => {
    const body = Settings.extend({ players: Lineup }).parse(req.body);
    const id = await tx(db, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO matches (name, rounds, round_seconds, break_seconds, created_by)
         VALUES (COALESCE(NULLIF($1, ''), 'Match ' || to_char(now() AT TIME ZONE $6, 'DD Mon HH24:MI')), $2, $3, $4, $5)
         RETURNING id`,
        [body.name ?? '', body.rounds, body.roundSeconds, body.breakSeconds, req.user!.id, config.TIME_ZONE],
      );
      await saveLineup(c, rows[0].id, body.players);
      return rows[0].id;
    });
    await app.audit(req, 'match.created', { id });
    return reply.code(201).send(await scoreboard(db, id, gameOpts));
  });

  app.get('/matches/:id', async (req) => {
    const { id } = Id.parse(req.params);
    return scoreboard(db, id, gameOpts);
  });

  app.get('/matches/:id/lineup', async (req) => {
    const { id } = Id.parse(req.params);
    const { rows } = await db.query(
      `SELECT player_id AS "playerId", team, kit_id AS "kitId" FROM match_players WHERE match_id = $1 ORDER BY id`,
      [id],
    );
    return { players: rows };
  });

  app.patch('/matches/:id', async (req) => {
    const { id } = Id.parse(req.params);
    const body = Settings.partial().extend({ players: Lineup.optional() }).parse(req.body);
    await tx(db, async (c) => {
      const { rows } = await c.query('SELECT status FROM matches WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new GameError(404, 'Match not found');
      if (rows[0].status !== 'setup') throw new GameError(409, 'A match can only be edited before it starts');
      await c.query(
        `UPDATE matches SET name = COALESCE(NULLIF($2, ''), name), rounds = COALESCE($3, rounds),
                round_seconds = COALESCE($4, round_seconds), break_seconds = COALESCE($5, break_seconds) WHERE id = $1`,
        [id, body.name ?? null, body.rounds ?? null, body.roundSeconds ?? null, body.breakSeconds ?? null],
      );
      if (body.players) await saveLineup(c, id, body.players);
    });
    await app.audit(req, 'match.updated', { id });
    return scoreboard(db, id, gameOpts);
  });

  app.delete('/matches/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const m = await getMatch(db, id);
    if (!m) return reply.code(404).send({ error: 'Match not found' });
    if (m.status !== 'setup' && req.user!.role !== 'admin')
      return reply.code(403).send({ error: 'Only an admin can delete a match that has been played' });
    if (['live', 'break', 'paused'].includes(m.status)) return reply.code(409).send({ error: 'End the match before deleting it' });
    await db.query('DELETE FROM matches WHERE id = $1', [id]);
    await app.audit(req, 'match.deleted', { id, name: m.name });
    return { ok: true };
  });

  app.post('/matches/:id/:action', async (req) => {
    const { id, action } = z
      .object({ id: z.coerce.number().int().positive(), action: z.enum(['start', 'pause', 'resume', 'next', 'end']) })
      .parse(req.params);
    await control(db, id, action as Control);
    await app.audit(req, `match.${action}`, { id });
    return scoreboard(db, id, gameOpts);
  });

  // Staff correction when a vest misses a hit or a kill.
  app.post('/matches/:id/events', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const body = z
      .object({
        type: z.enum(['hit', 'kill', 'respawn']),
        victimMatchPlayerId: z.number().int().positive(),
        shooterMatchPlayerId: z.number().int().positive().optional(),
        gun: z.number().int().min(0).max(3).optional(),
        damage: z.number().int().min(1).max(100).optional(),
      })
      .parse(req.body);
    const m = await getMatch(db, id);
    if (!m) return reply.code(404).send({ error: 'Match not found' });
    const res = await recordEvent(
      db,
      id,
      {
        type: body.type,
        victimMpId: body.victimMatchPlayerId,
        shooterMpId: body.shooterMatchPlayerId,
        gun: body.gun,
        damage: body.damage,
        source: 'manual',
      },
      gameOpts,
    );
    if (!res.accepted) return reply.code(400).send({ error: `Not recorded: ${res.reason.replace(/_/g, ' ')}` });
    await app.audit(req, 'event.manual', { matchId: id, ...body, eventId: res.eventId });
    return reply.code(201).send(res);
  });

  // A vest connected over Bluetooth to this console. The browser forwards each line the vest sends:
  //   H,<from>,<gun>,<hp>  hit    K,<from>,<gun>,0  down    P,<hp>  respawned
  // <from> is the shooter's kit (R2, B1) when the gun sends a player ID, or GEL / HEAD (body / helmet) when it does not.
  app.post('/matches/:id/vest-events', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const body = z
      .object({ kit: z.string().trim().toUpperCase().regex(/^[RB]\d{1,2}$/), line: z.string().trim().max(40) })
      .parse(req.body);
    const ev = parseVestLine(body.line);
    if (!ev) return reply.code(400).send({ error: 'Not a hit, down or respawn line' });
    const { rows } = await db.query<{ id: number; label: string }>(
      `SELECT mp.id, upper(k.label) AS label FROM match_players mp JOIN kits k ON k.id = mp.kit_id WHERE mp.match_id = $1`,
      [id],
    );
    const victim = rows.find((r) => r.label === body.kit);
    if (!victim) return reply.code(400).send({ error: `Kit ${body.kit} is not in this match` });
    let shooterMpId: number | undefined;
    if (ev.from) {
      shooterMpId = rows.find((r) => r.label === ev.from)?.id;
      if (shooterMpId == null) return reply.code(400).send({ error: `Kit ${ev.from} is not in this match` });
    }
    const res = await recordEvent(db, id, { type: ev.type, victimMpId: victim.id, shooterMpId, zone: ev.zone, source: 'vest' }, gameOpts);
    return reply.code(res.accepted ? 201 : 200).send(res);
  });

  app.delete('/events/:id', async (req) => {
    const { id } = Id.parse(req.params);
    await voidEvent(db, id);
    await app.audit(req, 'event.voided', { id });
    return { ok: true };
  });
};

export default routes;
