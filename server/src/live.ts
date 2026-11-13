import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Db } from './db.js';
import { matchBus, scoreboard, type GameOptions } from './game.js';
import { currentDisplayMatch } from './routes/public.js';

/**
 * Pushes scoreboards to screens. Clients only listen: they send `watch` (a match id) or `display`
 * (whatever the arena TV should show) and receive `scoreboard` snapshots. Snapshots hold no contact details.
 */
export function attachLive(http: HttpServer, db: Db, opts: GameOptions, corsOrigins: string[]) {
  const io = new Server(http, {
    cors: corsOrigins.length ? { origin: corsOrigins, credentials: true } : undefined,
    serveClient: false,
  });

  const send = async (target: string, matchId: number) => {
    try {
      io.to(target).emit('scoreboard', await scoreboard(db, matchId, opts));
    } catch {
      // Match deleted between the change and the push; nothing to show.
    }
  };

  io.on('connection', (socket) => {
    socket.on('watch', async (raw: unknown) => {
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0) return;
      for (const room of socket.rooms) if (room.startsWith('match:')) socket.leave(room);
      socket.join(`match:${id}`);
      try {
        socket.emit('scoreboard', await scoreboard(db, id, opts));
      } catch {
        socket.emit('scoreboard:error', 'Match not found');
      }
    });
    socket.on('display', async () => {
      socket.join('display');
      const id = await currentDisplayMatch(db);
      if (id) socket.emit('scoreboard', await scoreboard(db, id, opts));
      else socket.emit('scoreboard:none');
    });
  });

  // Coalesce bursts (an automatic rifle can land several hits a second) into one push per match.
  const pending = new Map<number, NodeJS.Timeout>();
  matchBus.on('change', (id: number) => {
    if (pending.has(id)) return;
    pending.set(
      id,
      setTimeout(async () => {
        pending.delete(id);
        await send(`match:${id}`, id);
        if ((await currentDisplayMatch(db)) === id) await send('display', id);
      }, 150),
    );
  });

  return io;
}
