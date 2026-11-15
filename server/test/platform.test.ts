import crypto from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, migrate, type Db } from '../src/db.js';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://arena:arena@localhost:5432/arena_test';

let db: Db;
let app: FastifyInstance;
let admin = '';
let operator = '';

before(async () => {
  db = createPool(DB_URL);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  app = await buildApp(db);
  admin = (await call('POST', '/api/auth/setup', { name: 'Admin', email: 'admin@arena.test', password: 'supersecret1' }, '')).body.accessToken;
  await call('POST', '/api/admin/staff', { name: 'Op', email: 'op@arena.test', password: 'operator123', role: 'operator' });
  operator = (await call('POST', '/api/auth/login', { email: 'op@arena.test', password: 'operator123' }, '')).body.accessToken;
});

after(async () => {
  await app.close();
  await db.end();
});

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, token = admin) {
  const res = await app.inject({ method, url, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.body ? (() => { try { return res.json(); } catch { return res.body; } })() : null, res };
}

const future = () => new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);

test('Admin dashboard RBAC, custom even/odd timer, HP reset, and winner rules', async () => {
  assert.equal((await call('GET', '/api/admin/dashboard', undefined, '')).status, 401);
  assert.equal((await call('GET', '/api/admin/dashboard', undefined, operator)).status, 403);
  const dash = await call('GET', '/api/admin/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.totalMatchesPlayed, 0);

  // Create 2 players & get kits
  const p1 = (await call('POST', '/api/players', { name: 'Red One' })).body.player.id;
  const p2 = (await call('POST', '/api/players', { name: 'Blue One' })).body.player.id;
  const kits = (await call('GET', '/api/admin/kits')).body.kits;
  const rKit = kits.find((k: { team: string }) => k.team === 'red').id;
  const bKit = kits.find((k: { team: string }) => k.team === 'blue').id;

  // Even-numbered duration (2 min = 120s) + custom seconds (125s)
  const m1 = await call('POST', '/api/matches', {
    name: 'No-Event Match',
    rounds: 1,
    roundSeconds: 125,
    breakSeconds: 0,
    players: [
      { playerId: p1, team: 'red', kitId: rKit },
      { playerId: p2, team: 'blue', kitId: bKit },
    ],
  });
  assert.equal(m1.status, 201);
  const id1 = m1.body.match.id;
  assert.equal(m1.body.timer.roundSeconds, 125);

  await call('POST', `/api/matches/${id1}/start`);
  // End match with 0 scoring events -> winner must be null (do not invent a winner)
  const ended1 = await call('POST', `/api/matches/${id1}/end`);
  assert.equal(ended1.status, 200);
  assert.equal(ended1.body.match.winner, null);

  // Match 2: 4 minutes (240s), hit + HP reset + kill + winner
  const m2 = await call('POST', '/api/matches', {
    name: 'Live Combat',
    rounds: 1,
    roundSeconds: 240,
    breakSeconds: 0,
    players: [
      { playerId: p1, team: 'red', kitId: rKit },
      { playerId: p2, team: 'blue', kitId: bKit },
    ],
  });
  const id2 = m2.body.match.id;
  const redMp = m2.body.players.find((p: { team: string }) => p.team === 'red').matchPlayerId;
  const blueMp = m2.body.players.find((p: { team: string }) => p.team === 'blue').matchPlayerId;

  await call('POST', `/api/matches/${id2}/start`);
  await call('POST', `/api/matches/${id2}/events`, { type: 'hit', shooterMatchPlayerId: redMp, victimMatchPlayerId: blueMp, damage: 40 });

  // Unauthorized user cannot reset HP
  assert.equal((await call('POST', `/api/matches/${id2}/reset-hp`, {}, '')).status, 401);

  // Reset single player HP
  const hpRes = await call('POST', `/api/matches/${id2}/reset-hp`, { matchPlayerId: blueMp });
  assert.equal(hpRes.status, 200);
  assert.equal(hpRes.body.resets[0].hpBefore, 60);
  assert.equal(hpRes.body.resets[0].hpAfter, 100);

  const hist = await call('GET', `/api/matches/${id2}/hp-history`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.history.length, 1);

  // Pause, resume, kill, end -> Red wins
  await call('POST', `/api/matches/${id2}/pause`);
  await call('POST', `/api/matches/${id2}/resume`);
  await call('POST', `/api/matches/${id2}/events`, { type: 'kill', shooterMatchPlayerId: redMp, victimMatchPlayerId: blueMp });
  const ended2 = await call('POST', `/api/matches/${id2}/end`);
  assert.equal(ended2.body.match.winner, 'red');
});

test('Customer Mobile OTP, slot locking, and payment verification + duplicate prevention', async () => {
  const badMobile = await call('POST', '/api/customer/auth/send-otp', { mobile: '12345' }, '');
  assert.equal(badMobile.status, 400);

  const otpRes = await call('POST', '/api/customer/auth/send-otp', { mobile: '9876543210' }, '');
  assert.equal(otpRes.status, 200);
  assert.equal(otpRes.body.mobile, '+919876543210');
  const devOtp = otpRes.body.devOtp;
  assert.match(devOtp, /^\d{6}$/);

  // Cooldown enforced
  const tooFast = await call('POST', '/api/customer/auth/send-otp', { mobile: '9876543210' }, '');
  assert.equal(tooFast.status, 429);

  // Wrong OTP rejected
  const wrong = await call('POST', '/api/customer/auth/verify-otp', { mobile: '9876543210', otp: '000000' }, '');
  assert.equal(wrong.status, 401);

  // Valid OTP returns customer token
  const ok = await call('POST', '/api/customer/auth/verify-otp', { mobile: '9876543210', otp: devOtp, name: 'Arjun' }, '');
  assert.equal(ok.status, 200);
  const custToken = ok.body.token;

  // Customer token cannot access admin/staff routes
  assert.equal((await call('GET', '/api/admin/dashboard', undefined, custToken)).status, 401);

  // Create booking
  const d = future();
  const b1 = await call('POST', '/api/customer/bookings', { packageId: '1v1', date: d, time: '18:00', name: 'Arjun' }, custToken);
  assert.equal(b1.status, 201);
  assert.equal(b1.body.booking.amountInr, 400);

  // Double booking same slot prevented (409)
  const bDup = await call('POST', '/api/customer/bookings', { packageId: '2v2', date: d, time: '18:00', name: 'Other' }, custToken);
  assert.equal(bDup.status, 409);

  // Create order & verify payment
  const order = await call('POST', '/api/customer/payments/create-order', { bookingId: b1.body.booking.id }, custToken);
  assert.equal(order.status, 200);
  const paymentId = 'pay_test_12345';
  const sig = crypto.createHmac('sha256', 'arena11-test-gateway').update(`${order.body.orderId}|${paymentId}`).digest('hex');

  const verified = await call('POST', '/api/customer/payments/verify', { orderId: order.body.orderId, paymentId, signature: sig }, custToken);
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'payment_successful');

  // Duplicate payment processing prevented
  const dupPay = await call('POST', '/api/customer/payments/verify', { orderId: order.body.orderId, paymentId, signature: sig }, custToken);
  assert.equal(dupPay.status, 409);

  // Receipt PDF
  const pdf = await app.inject({ method: 'GET', url: verified.body.receiptPdfUrl });
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
});
