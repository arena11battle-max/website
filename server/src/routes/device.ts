import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { getRunningMatch, recordEvent, timerState, type EventResult } from '../game.js';
import { decryptSecret, safeEqualHex, signDeviceRequest } from '../security.js';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const DeviceEvent = z.object({
  type: z.enum(['hit', 'kill', 'respawn']),
  victim: z.string().trim().toUpperCase().max(8),
  shooter: z.string().trim().toUpperCase().max(8).optional().nullable(),
  gun: z.number().int().min(0).max(3).optional().nullable(),
  hp: z.number().min(0).max(255).optional().nullable(),
  seq: z.number().int().min(0).max(2 ** 31 - 1).optional().nullable(),
});
const Body = z.union([
  z.object({ events: z.array(DeviceEvent).min(1).max(50), simulated: z.boolean().optional() }),
  DeviceEvent.extend({ simulated: z.boolean().optional() }),
]);

declare module 'fastify' {
  interface FastifyRequest {
    device?: { id: number; name: string };
  }
}

/**
 * Hubs and bridges sign every request:
 *   X-Device-Id: <id>   X-Timestamp: <unix ms>   X-Signature: hex HMAC-SHA256(secret, "<timestamp>.<raw body>")
 */
const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;
  const gameOpts = { respawnSeconds: config.RESPAWN_SECONDS };

  // Unsigned, so a hub without a real-time clock can learn the time before signing.
  app.get('/time', async () => ({ now: Date.now() }));

  async function verifyDevice(req: FastifyRequest, reply: FastifyReply) {
    const id = Number(req.headers['x-device-id']);
    const ts = String(req.headers['x-timestamp'] ?? '');
    const sig = String(req.headers['x-signature'] ?? '');
    const deny = () => reply.code(401).send({ error: 'Bad device signature' });
    if (!Number.isInteger(id) || !/^\d{10,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(sig)) return deny();
    if (Math.abs(Date.now() - Number(ts)) > MAX_CLOCK_SKEW_MS)
      return reply.code(401).send({ error: 'Device clock is off; sync with /api/device/time', serverNow: Date.now() });
    const { rows } = await db.query('SELECT id, name, secret_enc, active FROM devices WHERE id = $1', [id]);
    if (!rows[0]?.active) return deny();
    const expected = signDeviceRequest(decryptSecret(config.APP_SECRET, rows[0].secret_enc), ts, req.rawBody ?? '');
    if (!safeEqualHex(expected, sig.toLowerCase())) return deny();
    req.device = { id: rows[0].id, name: rows[0].name };
    await db.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [id]);
  }

  app.register(async (signed) => {
    signed.addHook('preHandler', verifyDevice);

    signed.get('/state', async () => {
      const m = await getRunningMatch(db);
      if (!m) return { match: null, kits: [] };
      const { rows: kits } = await db.query(
        `SELECT k.label, k.team, k.gun, COALESCE(NULLIF(p.nickname, ''), p.name) AS player
           FROM match_players mp JOIN kits k ON k.id = mp.kit_id JOIN players p ON p.id = mp.player_id
          WHERE mp.match_id = $1 ORDER BY k.label`,
        [m.id],
      );
      const t = timerState(m);
      return { match: { id: m.id, name: m.name, status: m.status, round: t.round, rounds: t.rounds, remainingMs: t.remainingMs }, kits };
    });

    signed.post('/events', { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } }, async (req, reply) => {
      const body = Body.parse(req.body);
      const events = 'events' in body ? body.events : [body];
      const m = await getRunningMatch(db);
      if (!m) return reply.code(202).send({ results: events.map(() => ({ accepted: false, reason: 'no_running_match' })) });

      const { rows } = await db.query<{ id: number; label: string }>(
        'SELECT mp.id, k.label FROM match_players mp JOIN kits k ON k.id = mp.kit_id WHERE mp.match_id = $1',
        [m.id],
      );
      const byLabel = new Map(rows.map((r) => [r.label.toUpperCase(), r.id]));
      const results: EventResult[] = [];
      for (const ev of events) {
        const victimMpId = byLabel.get(ev.victim);
        if (!victimMpId) {
          results.push({ accepted: false, reason: 'victim_not_in_match' });
          continue;
        }
        results.push(
          await recordEvent(
            db,
            m.id,
            {
              type: ev.type,
              victimMpId,
              shooterMpId: ev.shooter ? (byLabel.get(ev.shooter) ?? -1) : null,
              gun: ev.gun,
              hp: ev.hp,
              seq: ev.seq,
              deviceId: req.device!.id,
              source: body.simulated ? 'simulator' : 'device',
            },
            gameOpts,
          ),
        );
      }
      return { matchId: m.id, results };
    });
  });
};

export default routes;
