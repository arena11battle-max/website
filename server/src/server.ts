import { buildApp } from './app.js';
import { config } from './config.js';
import { createPool, migrate } from './db.js';
import { tick } from './game.js';
import { attachLive } from './live.js';

const db = createPool(config.DATABASE_URL);
const applied = await migrate(db);

const app = await buildApp(db, { logger: true });
if (applied.length) app.log.info({ applied }, 'database migrated');

const origins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
const io = attachLive(app.server, db, { respawnSeconds: config.RESPAWN_SECONDS }, origins);

// The round clock lives on the server: every second, end rounds and breaks whose time is up.
const timer = setInterval(() => tick(db).catch((err) => app.log.error(err, 'tick failed')), 1000);

await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async () => {
  clearInterval(timer);
  io.close();
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
