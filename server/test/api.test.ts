import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, migrate, type Db } from '../src/db.js';
import { tick } from '../src/game.js';
import { signDeviceRequest } from '../src/security.js';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://arena:arena@localhost:5432/arena_test';

let db: Db;
let app: FastifyInstance;
let adminToken = '';
let refreshCookie = '';

before(async () => {
  db = createPool(DB_URL);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  app = await buildApp(db);
});

after(async () => {
  await app.close();
  await db.end();
});

const auth = (token = adminToken) => ({ authorization: `Bearer ${token}` });

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, token = adminToken) {
  const res = await app.inject({ method, url, payload: body as object, headers: token ? auth(token) : {} });
  return { status: res.statusCode, body: res.body ? res.json() : null, res };
}

test('first-run setup creates one admin, then locks', async () => {
  assert.equal((await api('GET', '/api/auth/status', undefined, '')).body.needsSetup, true);
  const weak = await api('POST', '/api/auth/setup', { name: 'Jose', email: 'jose@arena.test', password: 'short' }, '');
  assert.equal(weak.status, 400);

  const ok = await api('POST', '/api/auth/setup', { name: 'Jose', email: 'Jose@Arena.test', password: 'supersecret1' }, '');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'admin');
  assert.equal(ok.body.user.email, 'jose@arena.test');
  adminToken = ok.body.accessToken;

  const again = await api('POST', '/api/auth/setup', { name: 'X', email: 'x@arena.test', password: 'supersecret1' }, '');
  assert.equal(again.status, 409);
});

test('login, refresh rotation and logout', async () => {
  const bad = await api('POST', '/api/auth/login', { email: 'jose@arena.test', password: 'wrong-password' }, '');
  assert.equal(bad.status, 401);
  const unknown = await api('POST', '/api/auth/login', { email: 'nobody@arena.test', password: 'wrong-password' }, '');
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, bad.body.error);

  const ok = await api('POST', '/api/auth/login', { email: 'jose@arena.test', password: 'supersecret1' }, '');
  assert.equal(ok.status, 200);
  const cookie = ok.res.cookies.find((c) => c.name === 'arena_refresh')!;
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.sameSite, 'Strict');
  refreshCookie = cookie.value;

  const r1 = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: refreshCookie } });
  assert.equal(r1.statusCode, 200);
  assert.ok(r1.json().accessToken);
  // The old refresh token was rotated out and can't be reused.
  const reuse = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { arena_refresh: refreshCookie } });
  assert.equal(reuse.statusCode, 401);

  assert.equal((await api('GET', '/api/auth/me', undefined, '')).status, 401);
  assert.equal((await api('GET', '/api/auth/me', undefined, 'not.a.token')).status, 401);
  assert.equal((await api('GET', '/api/auth/me')).body.user.name, 'Jose');
});

test('operators cannot use admin routes', async () => {
  const created = await api('POST', '/api/admin/staff', { name: 'Ravi', email: 'ravi@arena.test', password: 'operator123', role: 'operator' });
  assert.equal(created.status, 201);
  const login = await api('POST', '/api/auth/login', { email: 'ravi@arena.test', password: 'operator123' }, '');
  const opToken = login.body.accessToken;
  assert.equal((await api('GET', '/api/admin/staff', undefined, opToken)).status, 403);
  assert.equal((await api('POST', '/api/admin/devices', { name: 'x' }, opToken)).status, 403);
  assert.equal((await api('GET', '/api/admin/kits', undefined, opToken)).status, 200);
  assert.equal((await api('GET', '/api/players', undefined, opToken)).status, 200);

  // Disabling an account cuts it off immediately, even with a valid token.
  await api('PATCH', `/api/admin/staff/${created.body.staff.id}`, { active: false });
  assert.equal((await api('GET', '/api/players', undefined, opToken)).status, 401);
});

const ids: Record<string, number> = {};
const kitId: Record<string, number> = {};
let deviceId = 0;
let deviceSecret = '';
let matchId = 0;

test('players: add, validate, search, edit', async () => {
  assert.equal((await api('POST', '/api/players', { name: '' })).status, 400);
  assert.equal((await api('POST', '/api/players', { name: 'Bad', phone: 'call me' })).status, 400);
  for (const [name, nickname] of [
    ['Arjun', 'Viper'],
    ['Bhavya', 'Ghost'],
    ['Charan', 'Hawk'],
    ['Divya', null],
  ] as const) {
    const r = await api('POST', '/api/players', { name, nickname, phone: '+91 98765 43210' });
    assert.equal(r.status, 201);
    ids[name] = r.body.player.id;
  }
  const search = await api('GET', '/api/players?q=gho');
  assert.deepEqual(search.body.players.map((p: { name: string }) => p.name), ['Bhavya']);
  const edit = await api('PATCH', `/api/players/${ids.Divya}`, { nickname: 'Storm' });
  assert.equal(edit.body.player.nickname, 'Storm');
  assert.equal(edit.body.player.phone, '+91 98765 43210');

  const kits = await api('GET', '/api/admin/kits');
  for (const k of kits.body.kits) kitId[k.label] = k.id;
  assert.equal(kits.body.kits.length, 10);
});

test('match setup validates the lineup', async () => {
  const oneTeam = await api('POST', '/api/matches', {
    players: [
      { playerId: ids.Arjun, team: 'red', kitId: kitId.R1 },
      { playerId: ids.Bhavya, team: 'red', kitId: kitId.R2 },
    ],
  });
  assert.equal(oneTeam.status, 400);
  const wrongKit = await api('POST', '/api/matches', {
    players: [
      { playerId: ids.Arjun, team: 'red', kitId: kitId.B1 },
      { playerId: ids.Bhavya, team: 'blue', kitId: kitId.B2 },
    ],
  });
  assert.equal(wrongKit.status, 400);
  assert.match(wrongKit.body.error, /blue kit/);

  const ok = await api('POST', '/api/matches', {
    name: 'Evening match',
    rounds: 3,
    roundSeconds: 480,
    breakSeconds: 120,
    players: [
      { playerId: ids.Arjun, team: 'red', kitId: kitId.R1 }, // rifle
      { playerId: ids.Bhavya, team: 'red', kitId: kitId.R5 }, // AWM
      { playerId: ids.Charan, team: 'blue', kitId: kitId.B1 },
      { playerId: ids.Divya, team: 'blue', kitId: kitId.B3 }, // SMG
    ],
  });
  assert.equal(ok.status, 201);
  matchId = ok.body.match.id;
  assert.equal(ok.body.match.status, 'setup');
  assert.equal(ok.body.players.length, 4);
  assert.equal(ok.body.timer.remainingMs, 480_000);
});

async function deviceCall(method: 'GET' | 'POST', url: string, body?: unknown, opts: { secret?: string; ts?: number } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const ts = String(opts.ts ?? Date.now());
  const res = await app.inject({
    method,
    url,
    payload: raw || undefined,
    headers: {
      'content-type': 'application/json',
      'x-device-id': String(deviceId),
      'x-timestamp': ts,
      'x-signature': signDeviceRequest(opts.secret ?? deviceSecret, ts, raw),
    },
  });
  return { status: res.statusCode, body: res.json() };
}

test('device registration and signature checks', async () => {
  const r = await api('POST', '/api/admin/devices', { name: 'Scoreboard hub' });
  assert.equal(r.status, 201);
  deviceId = r.body.device.id;
  deviceSecret = r.body.secret;
  assert.ok(deviceSecret.length >= 40);
  assert.equal((await api('GET', '/api/admin/devices')).body.devices[0].secret, undefined);

  assert.equal((await deviceCall('GET', '/api/device/state', undefined, { secret: 'wrong' })).status, 401);
  assert.equal((await deviceCall('GET', '/api/device/state', undefined, { ts: Date.now() - 10 * 60_000 })).status, 401);
  const state = await deviceCall('GET', '/api/device/state');
  assert.equal(state.status, 200);
  assert.equal(state.body.match, null);

  // Body changed after signing -> rejected.
  const ts = String(Date.now());
  const tampered = await app.inject({
    method: 'POST',
    url: '/api/device/events',
    payload: JSON.stringify({ type: 'kill', victim: 'B1', shooter: 'R1' }),
    headers: {
      'content-type': 'application/json',
      'x-device-id': String(deviceId),
      'x-timestamp': ts,
      'x-signature': signDeviceRequest(deviceSecret, ts, JSON.stringify({ type: 'hit', victim: 'B1', shooter: 'R1' })),
    },
  });
  assert.equal(tampered.statusCode, 401);
});

test('a full match: hits, damage, kills, pause, rounds, winner', async () => {
  const noMatch = await deviceCall('POST', '/api/device/events', { type: 'hit', victim: 'B1', shooter: 'R1', hp: 75 });
  assert.equal(noMatch.body.results[0].reason, 'no_running_match');

  const started = await api('POST', `/api/matches/${matchId}/start`);
  assert.equal(started.status, 200);
  assert.equal(started.body.timer.status, 'live');
  assert.equal(started.body.timer.round, 1);
  assert.equal((await api('POST', `/api/matches/${matchId}/start`)).status, 409);

  const state = await deviceCall('GET', '/api/device/state');
  assert.equal(state.body.match.status, 'live');
  assert.deepEqual(state.body.kits.map((k: { label: string }) => k.label), ['B1', 'B3', 'R1', 'R5']);

  const batch = await deviceCall('POST', '/api/device/events', {
    events: [
      { type: 'hit', victim: 'B1', shooter: 'R1', gun: 1, hp: 75, seq: 1 }, // 25 dmg
      { type: 'hit', victim: 'B1', shooter: 'R1', gun: 1, hp: 75, seq: 1 }, // radio duplicate
      { type: 'hit', victim: 'B1', shooter: 'R1', gun: 1, hp: 50, seq: 2 }, // 25 dmg
      { type: 'hit', victim: 'R1', shooter: 'R5', gun: 3, hp: 30, seq: 1 }, // same team
      { type: 'hit', victim: 'R9', shooter: 'B1', seq: 1 }, // not playing
      { type: 'kill', victim: 'B1', shooter: 'R5', gun: 3, seq: 3 }, // finishes the last 50
      { type: 'hit', victim: 'B1', shooter: 'R1', gun: 1, hp: 75, seq: 4 }, // already dead
      { type: 'hit', victim: 'R1', shooter: 'B3', gun: 2 }, // B3's kit is an SMG -> 15 damage, R1 at 85
      { type: 'hit', victim: 'R1', shooter: 'B3', gun: 3, hp: 0 }, // hardware claims AWM and 0 HP; server still scores SMG 15
    ],
  });
  assert.equal(batch.status, 200);
  const reasons = batch.body.results.map((r: { accepted: boolean; reason?: string; type?: string }) => (r.accepted ? r.type : r.reason));
  assert.deepEqual(reasons, ['hit', 'duplicate', 'hit', 'friendly_fire', 'victim_not_in_match', 'kill', 'victim_dead', 'hit', 'hit']);
  assert.equal(batch.body.results[8].hpAfter, 70, 'server is authoritative for health');

  // Five more SMG hits: 70 -> 55 -> 40 -> 25 -> 10 -> 0, the last one is the kill.
  const finish = await deviceCall('POST', '/api/device/events', {
    events: Array.from({ length: 5 }, () => ({ type: 'hit', victim: 'R1', shooter: 'B3' })),
  });
  assert.deepEqual(
    finish.body.results.map((r: { type?: string; hpAfter?: number }) => `${r.type}:${r.hpAfter}`),
    ['hit:55', 'hit:40', 'hit:25', 'hit:10', 'kill:0'],
  );

  const sb = (await api('GET', `/api/matches/${matchId}`)).body;
  const p = (kit: string) => sb.players.find((x: { kit: string }) => x.kit === kit);
  assert.equal(p('R1').hits, 2);
  assert.equal(p('R1').damageDealt, 50);
  assert.equal(p('R1').kills, 0);
  assert.equal(p('R1').deaths, 1);
  assert.equal(p('R1').damageTaken, 100);
  assert.equal(p('R5').kills, 1);
  assert.equal(p('R5').damageDealt, 50);
  assert.equal(p('B1').deaths, 1);
  assert.equal(p('B1').alive, false);
  assert.equal(p('B1').hp, 0);
  assert.ok(p('B1').respawnAt);
  assert.equal(p('B3').kills, 1);
  assert.equal(p('B3').damageDealt, 100);
  assert.equal(sb.teams.red.score, 1);
  assert.equal(sb.teams.blue.score, 1);
  assert.equal(sb.feed[0].type, 'kill');
  assert.equal(sb.feed[0].shooter, 'Storm');
  assert.equal(sb.players[0].phone, undefined, 'scoreboards must not expose phone numbers');

  // Respawn brings the player back to full health.
  await deviceCall('POST', '/api/device/events', { type: 'respawn', victim: 'B1', seq: 5 });
  const afterRespawn = (await api('GET', `/api/matches/${matchId}`)).body;
  assert.equal(afterRespawn.players.find((x: { kit: string }) => x.kit === 'B1').hp, 100);

  // Paused: the timer freezes and the vests' hits are not counted.
  const paused = await api('POST', `/api/matches/${matchId}/pause`);
  assert.equal(paused.body.timer.status, 'paused');
  const frozen = paused.body.timer.remainingMs;
  assert.ok(frozen > 470_000 && frozen <= 480_000);
  const duringPause = await deviceCall('POST', '/api/device/events', { type: 'hit', victim: 'R1', shooter: 'B1', hp: 75 });
  assert.equal(duringPause.body.results[0].reason, 'match_paused');
  const resumed = await api('POST', `/api/matches/${matchId}/resume`);
  assert.equal(resumed.body.timer.status, 'live');
  assert.ok(Math.abs(resumed.body.timer.remainingMs - frozen) < 2000);

  // Staff can add a missed kill by hand and void a wrong one.
  const manual = await api('POST', `/api/matches/${matchId}/events`, {
    type: 'kill',
    victimMatchPlayerId: p('B3').matchPlayerId,
    shooterMatchPlayerId: p('R1').matchPlayerId,
  });
  assert.equal(manual.status, 201);
  assert.equal((await api('GET', `/api/matches/${matchId}`)).body.teams.red.score, 2);
  assert.equal((await api('DELETE', `/api/events/${manual.body.eventId}`)).status, 200);
  assert.equal((await api('GET', `/api/matches/${matchId}`)).body.teams.red.score, 1);
  await api('POST', `/api/matches/${matchId}/events`, {
    type: 'kill',
    victimMatchPlayerId: p('B3').matchPlayerId,
    shooterMatchPlayerId: p('R1').matchPlayerId,
  });

  // Round 1 time runs out -> break -> round 2.
  await db.query("UPDATE matches SET phase_ends_at = now() - interval '1 second' WHERE id = $1", [matchId]);
  assert.deepEqual(await tick(db), [matchId]);
  let m = (await api('GET', `/api/matches/${matchId}`)).body;
  assert.equal(m.timer.status, 'break');
  assert.ok(m.timer.remainingMs > 110_000);
  await db.query("UPDATE matches SET phase_ends_at = now() - interval '1 second' WHERE id = $1", [matchId]);
  await tick(db);
  m = (await api('GET', `/api/matches/${matchId}`)).body;
  assert.equal(m.timer.status, 'live');
  assert.equal(m.timer.round, 2);
  // New round: everyone back to full health.
  assert.ok(m.players.every((x: { hp: number; alive: boolean }) => x.hp === 100 && x.alive));

  await deviceCall('POST', '/api/device/events', { type: 'kill', victim: 'R5', shooter: 'B1', seq: 9 });

  // "Next" skips straight on; round 3's end finishes the match.
  await api('POST', `/api/matches/${matchId}/next`);
  await api('POST', `/api/matches/${matchId}/next`);
  m = (await api('GET', `/api/matches/${matchId}`)).body;
  assert.equal(m.timer.round, 3);
  await db.query("UPDATE matches SET phase_ends_at = now() - interval '1 second' WHERE id = $1", [matchId]);
  await tick(db);
  m = (await api('GET', `/api/matches/${matchId}`)).body;
  assert.equal(m.match.status, 'finished');
  assert.equal(m.match.winner, 'draw');
  assert.deepEqual(
    m.rounds.map((r: { red: number; blue: number }) => [r.red, r.blue]),
    [
      [2, 1],
      [0, 1],
      [0, 0],
    ],
  );
  assert.equal(m.mvp.displayName, 'Viper');

  const lb = (await api('GET', '/api/leaderboard')).body.leaderboard;
  assert.equal(lb.length, 4);
  assert.equal(lb[0].kills, 1);

  const pub = await app.inject({ method: 'GET', url: '/api/public/live' });
  assert.equal(pub.json().match.id, matchId);
});

test('only one match can run at a time', async () => {
  const lineup = [
    { playerId: ids.Arjun, team: 'red', kitId: kitId.R1 },
    { playerId: ids.Charan, team: 'blue', kitId: kitId.B1 },
  ];
  const a = await api('POST', '/api/matches', { players: lineup });
  const b = await api('POST', '/api/matches', { players: lineup });
  assert.equal((await api('POST', `/api/matches/${a.body.match.id}/start`)).status, 200);
  const blocked = await api('POST', `/api/matches/${b.body.match.id}/start`);
  assert.equal(blocked.status, 409);
  await api('POST', `/api/matches/${a.body.match.id}/end`);
  assert.equal((await api('POST', `/api/matches/${b.body.match.id}/start`)).status, 200);
  await api('POST', `/api/matches/${b.body.match.id}/end`);
});

test('Bluetooth vest lines: unattributed body and head hits, down, respawn, team score', async () => {
  const lineup = [
    { playerId: ids.Arjun, team: 'red', kitId: kitId.R1 },
    { playerId: ids.Charan, team: 'blue', kitId: kitId.B1 },
  ];
  const m = await api('POST', '/api/matches', { players: lineup });
  const id = m.body.match.id;
  const vest = (kit: string, line: string) => api('POST', `/api/matches/${id}/vest-events`, { kit, line });
  assert.equal((await vest('B1', 'H,GEL,9,75')).body.reason, 'match_not_started');
  await api('POST', `/api/matches/${id}/start`);

  const body = await vest('B1', 'H,GEL,9,75');
  assert.equal(body.status, 201);
  assert.deepEqual([body.body.damage, body.body.hpAfter], [25, 75]);
  const head = await vest('B1', 'H,HEAD,9,25');
  assert.deepEqual([head.body.damage, head.body.hpAfter], [50, 25]);
  const down = await vest('B1', 'K,GEL,9,0');
  assert.equal(down.body.type, 'kill');
  assert.equal((await vest('B1', 'H,GEL,9,75')).body.reason, 'victim_dead');
  assert.equal((await vest('B1', 'P,100')).body.type, 'respawn');
  assert.equal((await vest('B1', 'H,GEL,9,75')).body.hpAfter, 75);

  // A gun that sends its player ID gets the credit; same-team IDs are refused.
  const credited = await vest('R1', 'H,B1,1,75');
  assert.equal(credited.body.hpAfter, 75);
  assert.equal((await vest('B1', 'H,B1,1,75')).body.reason, 'friendly_fire');
  assert.equal((await vest('R9', 'H,GEL,9,75')).status, 400);
  assert.equal((await vest('B1', 'S,1,100,1,1')).status, 400);

  const board = (await api('GET', `/api/matches/${id}`)).body;
  assert.equal(board.teams.red.score, 1, 'a vest kill with no shooter scores for the other team');
  assert.equal(board.teams.blue.score, 0);
  const blue = board.players.find((p: { team: string }) => p.team === 'blue');
  assert.deepEqual([blue.deaths, blue.hp], [1, 75]);
  assert.equal(board.feed.find((f: { type: string }) => f.type === 'kill').gunName, 'Body');
  await api('POST', `/api/matches/${id}/end`);
});
