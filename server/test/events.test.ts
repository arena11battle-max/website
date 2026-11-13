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

test('ALOHA 2026 SRMAP UNIVERSITY: 1 vs 1 for 400, admin coupons, registration & PDF export', async () => {
  const ev = await call('GET', '/api/public/events/aloha-2026', undefined, '');
  assert.equal(ev.status, 200);
  assert.equal(ev.body.event.name, 'ALOHA 2026 SRMAP UNIVERSITY');
  assert.equal(ev.body.event.gameMode, '1 vs 1');
  assert.equal(ev.body.event.basePrice, 400);

  // Operator cannot create coupons
  assert.equal(
    (await call('POST', '/api/admin/events/aloha-2026/coupons', { code: 'NOPE', discountType: 'flat', discountValue: 50 }, operator)).status,
    403,
  );

  // Admin creates a flat coupon and a percent coupon
  const c1 = await call('POST', '/api/admin/events/aloha-2026/coupons', {
    code: 'ALOHA100',
    discountType: 'flat',
    discountValue: 100,
    maxUses: 1,
  });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.coupon.code, 'ALOHA100');

  const c2 = await call('POST', '/api/admin/events/aloha-2026/coupons', {
    code: 'SRM25',
    discountType: 'percent',
    discountValue: 25,
  });
  assert.equal(c2.status, 201);

  // Validate coupon
  const v1 = await call('POST', '/api/public/events/aloha-2026/validate-coupon', { code: 'aloha100' }, '');
  assert.equal(v1.status, 200);
  assert.equal(v1.body.discountAmount, 100);
  assert.equal(v1.body.finalPrice, 300);

  // Register with coupon
  const reg1 = await call(
    'POST',
    '/api/public/events/aloha-2026/register',
    {
      name: 'Kiran Kumar',
      clgRegNo: 'ap23110010001',
      mobileNumber: '+91 98765 43210',
      email: 'kiran@srmap.edu.in',
      couponCode: 'ALOHA100',
    },
    '',
  );
  assert.equal(reg1.status, 201);
  assert.match(reg1.body.registration.reference, /^ALH-[0-9A-F]{6}$/);
  assert.equal(reg1.body.registration.finalPrice, 300);
  assert.equal(reg1.body.registration.clgRegNo, 'AP23110010001');

  // Reusing maxUses=1 coupon fails
  const regFail = await call(
    'POST',
    '/api/public/events/aloha-2026/register',
    {
      name: 'Second Student',
      clgRegNo: 'AP23110010002',
      mobileNumber: '9876543211',
      email: 'second@srmap.edu.in',
      couponCode: 'ALOHA100',
    },
    '',
  );
  assert.equal(regFail.status, 400);

  // Register without coupon (400)
  const reg2 = await call(
    'POST',
    '/api/public/events/aloha-2026/register',
    {
      name: 'Priya Sharma',
      clgRegNo: 'AP23110010003',
      mobileNumber: '9876543212',
      email: 'priya@srmap.edu.in',
    },
    '',
  );
  assert.equal(reg2.status, 201);
  assert.equal(reg2.body.registration.finalPrice, 400);

  // Individual PDF download
  const pdfRes = await app.inject({ method: 'GET', url: reg1.body.pdfUrl });
  assert.equal(pdfRes.statusCode, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(pdfRes.rawPayload.subarray(0, 5).toString('ascii') === '%PDF-');

  // Staff list + All registrations PDF
  const list = await call('GET', '/api/events/aloha-2026/registrations', undefined, operator);
  assert.equal(list.status, 200);
  assert.equal(list.body.registrations.length, 2);
  assert.equal(list.body.summary.totalRevenue, 700);

  const allPdfRes = await app.inject({
    method: 'GET',
    url: '/api/events/aloha-2026/registrations/pdf',
    headers: { authorization: `Bearer ${operator}` },
  });
  assert.equal(allPdfRes.statusCode, 200);
  assert.equal(allPdfRes.headers['content-type'], 'application/pdf');
  assert.ok(allPdfRes.rawPayload.subarray(0, 5).toString('ascii') === '%PDF-');
});
