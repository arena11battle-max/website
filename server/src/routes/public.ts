import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { scoreboard } from '../game.js';

/** Read-only data for the arena TV. Scoreboards hold nicknames and stats only, no contact details. */
const routes: FastifyPluginAsync = async (app) => {
  app.get('/live', async () => {
    const id = await currentDisplayMatch(app.db);
    return id ? scoreboard(app.db, id, { respawnSeconds: config.RESPAWN_SECONDS }) : { match: null };
  });
};

/** The running match, else the match that finished in the last 15 minutes (so the TV shows the result). */
export async function currentDisplayMatch(db: import('../db.js').Queryable): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM matches
      WHERE status IN ('live','break','paused') OR (status = 'finished' AND finished_at > now() - interval '15 minutes')
      ORDER BY (status <> 'finished') DESC, id DESC LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

export default routes;
