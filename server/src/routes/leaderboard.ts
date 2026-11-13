import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { verifyAccessToken } from '../security.js';

// Public leaderboard. Anonymous visitors get nicknames and stats only; signed-in staff also get ids and real names.
const routes: FastifyPluginAsync = async (app) => {
  app.get('/leaderboard', async (req) => {
    const q = z
      .object({
        period: z.enum(['today', '7', '30', 'all']).optional(),
        days: z.coerce.number().int().min(0).max(3650).optional(),
      })
      .parse(req.query);
    const days = q.period === 'today' ? null : q.period === 'all' ? null : q.period ? Number(q.period) : q.days || null;
    const today = q.period === 'today' || q.days === 0;

    const header = req.headers.authorization;
    const staff = header?.startsWith('Bearer ') ? verifyAccessToken(config.APP_SECRET, header.slice(7)) !== null : false;

    const { rows } = await app.db.query(
      `WITH finished AS (
         SELECT id, winner FROM matches
          WHERE status = 'finished'
            AND ($1::boolean = false OR finished_at >= (date_trunc('day', now() AT TIME ZONE $3) AT TIME ZONE $3))
            AND ($2::int IS NULL OR finished_at > now() - make_interval(days => $2))
       ),
       s AS (
         SELECT mp.id AS mp_id, mp.match_id, mp.player_id, mp.team, f.winner,
           count(*) FILTER (WHERE e.shooter_mp_id = mp.id AND e.type = 'kill') AS kills,
           count(*) FILTER (WHERE e.victim_mp_id = mp.id AND e.type = 'kill') AS deaths,
           count(*) FILTER (WHERE e.shooter_mp_id = mp.id AND e.type IN ('hit','kill')) AS hits,
           COALESCE(sum(e.damage) FILTER (WHERE e.shooter_mp_id = mp.id), 0) AS damage
         FROM match_players mp
         JOIN finished f ON f.id = mp.match_id
         LEFT JOIN events e ON e.match_id = mp.match_id AND NOT e.voided AND (e.shooter_mp_id = mp.id OR e.victim_mp_id = mp.id)
         GROUP BY mp.id, f.winner
       ),
       ranked AS (
         SELECT s.*, row_number() OVER (PARTITION BY match_id ORDER BY kills DESC, damage DESC, deaths ASC, mp_id) AS place
           FROM s
       )
       SELECT p.id, p.name, p.nickname,
              COALESCE(NULLIF(p.nickname, ''), p.name) AS "displayName",
              count(*)::int AS matches,
              count(*) FILTER (WHERE r.winner = r.team)::int AS wins,
              sum(kills)::int AS kills, sum(deaths)::int AS deaths, sum(hits)::int AS hits, sum(damage)::int AS damage,
              count(*) FILTER (WHERE place = 1 AND (kills > 0 OR damage > 0))::int AS mvps
         FROM ranked r JOIN players p ON p.id = r.player_id
        GROUP BY p.id
        ORDER BY kills DESC, damage DESC, deaths ASC, p.id
        LIMIT 50`,
      [today, days, config.TIME_ZONE],
    );
    return {
      leaderboard: rows.map((r, i) => {
        const base = { rank: i + 1, displayName: r.displayName, matches: r.matches, wins: r.wins, kills: r.kills, deaths: r.deaths, hits: r.hits, damage: r.damage, mvps: r.mvps };
        return staff ? { ...base, id: r.id, name: r.name, nickname: r.nickname } : base;
      }),
    };
  });
};

export default routes;
