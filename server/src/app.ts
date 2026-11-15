import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import type { Db } from './db.js';
import { GameError } from './game.js';
import { verifyAccessToken, type Role } from './security.js';
import authRoutes from './routes/auth.js';
import playerRoutes from './routes/players.js';
import matchRoutes from './routes/matches.js';
import deviceRoutes from './routes/device.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import leaderboardRoutes from './routes/leaderboard.js';
import websiteRoutes from './routes/website.js';
import eventRoutes from './routes/events.js';
import customerAuthRoutes from './routes/customerAuth.js';
import paymentRoutes from './routes/payments.js';

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    audit: (req: FastifyRequest, action: string, detail?: unknown) => Promise<void>;
  }
  interface FastifyRequest {
    user?: StaffUser;
    rawBody?: string;
  }
}

export async function buildApp(db: Db, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  app.decorate('db', db);

  // Keep the raw JSON text so device signatures can be checked against exactly what was sent.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      const err = new Error('Invalid JSON') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://www.googleapis.com',
        ],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com', 'https://www.recaptcha.net', 'https://*.firebaseapp.com'],
        formAction: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://www.google.com', 'https://www.gstatic.com', 'https://www.recaptcha.net', 'https://apis.google.com'],
        upgradeInsecureRequests: null,
      },
    },
    // Allow Firebase Google Sign-In popup to communicate back to the opener window.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    // The app is often reached over plain http on the venue LAN.
    strictTransportSecurity: config.COOKIE_SECURE,
  });
  const origins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : false, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const claims = header?.startsWith('Bearer ') ? verifyAccessToken(config.APP_SECRET, header.slice(7)) : null;
    if (!claims) return reply.code(401).send({ error: 'Please sign in' });
    const { rows } = await db.query<StaffUser & { active: boolean }>(
      'SELECT id, name, email, role, active FROM staff_users WHERE id = $1',
      [claims.sub],
    );
    if (!rows[0]?.active) return reply.code(401).send({ error: 'Account disabled' });
    const { active: _active, ...user } = rows[0];
    req.user = user;
  });

  app.decorate('requireRole', (role: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (reply.sent) return;
    if (role === 'admin' && req.user!.role !== 'admin') return reply.code(403).send({ error: 'Admins only' });
  });

  app.decorate('audit', async (req: FastifyRequest, action: string, detail?: unknown) => {
    await db.query('INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)', [
      req.user?.id ?? null,
      action,
      detail === undefined ? null : JSON.stringify(detail),
    ]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; '),
      });
    }
    if (err instanceof GameError) return reply.code(err.statusCode).send({ error: err.message });
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.code === '23505') return reply.code(409).send({ error: 'That already exists' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong' });
  });

  app.get('/api/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(playerRoutes, { prefix: '/api/players' });
  await app.register(matchRoutes, { prefix: '/api' });
  await app.register(deviceRoutes, { prefix: '/api/device' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(leaderboardRoutes, { prefix: '/api' });
  await app.register(websiteRoutes, { prefix: '/api' });
  await app.register(eventRoutes, { prefix: '/api' });
  await app.register(customerAuthRoutes, { prefix: '/api' });
  await app.register(paymentRoutes, { prefix: '/api' });

  // Serve the built web app, with every non-API path falling back to index.html.
  const webDist = path.resolve(config.WEB_DIST);
  if (existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/socket.io/'))
        return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
