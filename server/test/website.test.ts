import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, migrate, type Db } from '../src/db.js';
import { signDeviceRequest } from '../src/security.js';

// Website APIs (bookings, venue settings, gallery, public leaderboard) plus security rules from the ARENA11 spec.

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
  admin = (await call('POST', '/api/auth/setup', { name: 'Jose', email: 'jose@arena.test', password: 'supersecret1' }, '')).body.accessToken;
  await call('POST', '/api/admin/staff', { name: 'Ravi', email: 'ravi@arena.test', password: 'operator123', role: 'operator' });
  operator = (await call('POST', '/api/auth/login', { email: 'ravi@arena.test', password: 'operator123' }, '')).body.accessToken;
});

after(async () => {
  await app.close();
  await db.end();
});

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, token = admin) {
  const res = await app.inject({ method, url, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.body ? (() => { try { return res.json(); } catch { return res.body; } })() : null, res };
}

const future = () => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

test('booking enquiries: validation, honeypot, staff workflow', async () => {
  const bad = await call('POST', '/api/public/bookings', { name: 'A', phone: '12', players: 12, date: '2020-01-01', time: '25:00', mode: 'deathrace', loadout: 'Bazooka' }, '');
  assert.equal(bad.status, 400);
  const past = await call('POST', '/api/public/bookings', { name: 'Asha', phone: '+91 98765 43210', players: 4, date: '2020-01-01', time: '18:00' }, '');
  assert.equal(past.status, 400);

  const ok = await call('POST', '/api/public/bookings', { name: 'Asha', phone: '+91 98765 43210', email: 'asha@example.com', players: 6, date: future(), time: '18:30', notes: 'Birthday', mode: 'domination', loadout: 'Tactical M4' }, '');
  assert.equal(ok.status, 201);
  assert.match(ok.body.reference, /^A11-[0-9A-F]{6}$/);
  assert.equal(ok.body.status, 'enquiry', 'an enquiry is never reported as a confirmed booking');

  const bot = await call('POST', '/api/public/bookings', { name: 'Bot', phone: '+1 555 555 5555', players: 2, date: future(), time: '10:00', website: 'spam.example' }, '');
  assert.equal(bot.status, 201);

  assert.equal((await call('GET', '/api/bookings', undefined, '')).status, 401);
  const list = await call('GET', '/api/bookings', undefined, operator);
  assert.equal(list.status, 200);
  assert.equal(list.body.bookings.length, 1, 'honeypot submissions are not stored');
  const b = list.body.bookings[0];
  assert.equal(b.status, 'new');
  assert.equal(b.phone, '+91 98765 43210');
  assert.equal(b.mode, 'domination', 'the game mode picked on the website reaches staff');
  assert.equal(b.loadout, 'Tactical M4');

  const confirmed = await call('PATCH', `/api/bookings/${b.id}`, { status: 'confirmed', staffNotes: 'Called, confirmed 6 players' }, operator);
  assert.equal(confirmed.status, 200);
  const after = (await call('GET', '/api/bookings?status=confirmed')).body.bookings[0];
  assert.equal(after.handledBy, 'Ravi');
  assert.equal(after.staffNotes, 'Called, confirmed 6 players');
  const audit = (await call('GET', '/api/admin/audit')).body.audit;
  assert.ok(audit.some((a: { action: string }) => a.action === 'booking.updated'));
});

test('venue settings: admins edit, everyone reads', async () => {
  assert.equal((await call('PUT', '/api/admin/site', { phone: '+91 90000 00000' }, operator)).status, 403);
  assert.equal((await call('PUT', '/api/admin/site', { mapsUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('PUT', '/api/admin/site', { instagram: 'http://insecure.example' })).status, 400);
  const saved = await call('PUT', '/api/admin/site', { phone: '+91 90000 00000', instagram: 'https://instagram.com/arena11', address: 'Plot 11' });
  assert.equal(saved.status, 200);
  const pub = (await call('GET', '/api/public/site', undefined, '')).body.settings;
  assert.equal(pub.phone, '+91 90000 00000');
  assert.equal(pub.instagram, 'https://instagram.com/arena11');
  assert.equal(pub.email, '');
});

test('gallery: only real images, admin only, public listing', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const upload = (body: Buffer, type: string, token = admin) =>
    app.inject({ method: 'POST', url: '/api/admin/gallery?caption=Opening%20night&category=gameplay', payload: body, headers: { authorization: `Bearer ${token}`, 'content-type': type } });
  assert.equal((await upload(png, 'image/png', operator)).statusCode, 403);
  assert.equal((await upload(Buffer.from('<svg onload=alert(1)>'), 'image/png')).statusCode, 415);
  const ok = await upload(png, 'image/png');
  assert.equal(ok.statusCode, 201);
  const list = (await call('GET', '/api/public/gallery', undefined, '')).body.items;
  assert.equal(list.length, 1);
  const img = await app.inject({ method: 'GET', url: list[0].url });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  await call('PATCH', `/api/admin/gallery/${ok.json().item.id}`, { published: false });
  assert.equal((await call('GET', '/api/public/gallery', undefined, '')).body.items.length, 0);
});

test('public leaderboard hides real names; staff see them', async () => {
  // A finished match with one kill, built directly in the database.
  const p1 = (await call('POST', '/api/players', { name: 'Kiran Rao', nickname: 'Ghost', phone: '9000000001' })).body.player;
  const p2 = (await call('POST', '/api/players', { name: 'Meena Iyer', nickname: '', phone: '9000000002' })).body.player;
  const kits = (await call('GET', '/api/admin/kits')).body.kits;
  const r1 = kits.find((k: { label: string }) => k.label === 'R1').id;
  const b1 = kits.find((k: { label: string }) => k.label === 'B1').id;
  const m = await call('POST', '/api/matches', { name: 'LB', players: [{ playerId: p1.id, team: 'red', kitId: r1 }, { playerId: p2.id, team: 'blue', kitId: b1 }] });
  const id = m.body.match.id;
  await call('POST', `/api/matches/${id}/start`);
  const lineup = (await call('GET', `/api/matches/${id}`)).body.players;
  const ghost = lineup.find((x: { kit: string }) => x.kit === 'R1').matchPlayerId;
  const meena = lineup.find((x: { kit: string }) => x.kit === 'B1').matchPlayerId;
  await call('POST', `/api/matches/${id}/events`, { type: 'kill', victimMatchPlayerId: meena, shooterMatchPlayerId: ghost });
  await call('POST', `/api/matches/${id}/end`);

  const anon = (await call('GET', '/api/leaderboard?period=all', undefined, '')).body.leaderboard;
  assert.equal(anon[0].displayName, 'Ghost');
  assert.equal(anon[0].mvps, 1);
  assert.equal(anon[0].kills, 1);
  assert.equal(anon[0].name, undefined);
  assert.equal(anon[0].id, undefined);
  assert.equal(JSON.stringify(anon).includes('9000000001'), false);
  const today = (await call('GET', '/api/leaderboard?period=today', undefined, '')).body.leaderboard;
  assert.equal(today.length, 2);
  const staff = (await call('GET', '/api/leaderboard?period=7')).body.leaderboard;
  assert.equal(staff[0].name, 'Kiran Rao');

  const live = await app.inject({ method: 'GET', url: '/api/public/live' });
  assert.equal(live.body.includes('9000000001'), false, 'public live board never carries phone numbers');
});

test('sessions: refresh-token reuse ends every session, sign out everywhere', async () => {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'jose@arena.test', password: 'supersecret1' } });
  const first = login.cookies.find((c) => c.name === 'arena_refresh')!.value;
  const rotated = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: first } });
  const second = rotated.cookies.find((c) => c.name === 'arena_refresh')!.value;
  // Replaying the old token (as a thief would) revokes the new one too.
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: first } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: second } })).statusCode, 401);

  const again = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'jose@arena.test', password: 'supersecret1' } });
  const token = again.json().accessToken;
  const cookie = again.cookies.find((c) => c.name === 'arena_refresh')!.value;
  assert.equal((await call('POST', '/api/auth/sessions/revoke', {}, token)).status, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: cookie } })).statusCode, 401);
});

test('admins cannot disable or demote themselves', async () => {
  const me = (await call('GET', '/api/auth/me')).body.user;
  assert.equal((await call('PATCH', `/api/admin/staff/${me.id}`, { active: false })).status, 400);
  assert.equal((await call('PATCH', `/api/admin/staff/${me.id}`, { role: 'operator' })).status, 400);
});

test('disabled devices and wrong match phases are rejected', async () => {
  const dev = (await call('POST', '/api/admin/devices', { name: 'Hub 2' })).body;
  const send = (body: unknown) => {
    const raw = JSON.stringify(body);
    const ts = String(Date.now());
    return app.inject({
      method: 'POST',
      url: '/api/device/events',
      payload: raw,
      headers: { 'content-type': 'application/json', 'x-device-id': String(dev.device.id), 'x-timestamp': ts, 'x-signature': signDeviceRequest(dev.secret, ts, raw) },
    });
  };
  const noMatch = await send({ type: 'hit', victim: 'B1', shooter: 'R1' });
  assert.equal(noMatch.json().results[0].reason, 'no_running_match');
  await call('PATCH', `/api/admin/devices/${dev.device.id}`, { active: false });
  assert.equal((await send({ type: 'hit', victim: 'B1', shooter: 'R1' })).statusCode, 401);
});

test('security headers and body limit', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.match(String(res.headers['content-security-policy']), /default-src 'self'/);
  assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  const big = await app.inject({ method: 'POST', url: '/api/auth/login', payload: JSON.stringify({ notes: 'x'.repeat(300 * 1024) }), headers: { 'content-type': 'application/json' } });
  assert.equal(big.statusCode, 413);
  const err = await app.inject({ method: 'POST', url: '/api/auth/login', payload: '{bad json', headers: { 'content-type': 'application/json' } });
  assert.equal(err.statusCode, 400);
  assert.equal(err.body.includes('at '), false, 'no stack traces');
});
