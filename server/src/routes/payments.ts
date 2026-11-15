import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { config } from '../config.js';
import { tx } from '../db.js';
import { sendAdminBookingEmail } from '../notify.js';
import { makeCustomerAuth } from './customerAuth.js';

export const BOOKING_PACKAGES = [
  { id: '1v1', name: '1 vs 1 TDM Duel (30–40 min)', players: 2, amountInr: 300, mode: 'tdm', available: true },
  { id: '2v2', name: '2 vs 2 TDM Squad (30–40 min)', players: 4, amountInr: 500, mode: 'tdm', available: false },
] as const;

const SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'] as const;

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function razorpayConfigured() {
  return Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);
}

function hmacHex(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

function renderReceiptPdf(p: {
  receiptNo: string;
  reference: string;
  name: string;
  mobile: string;
  email: string | null;
  packageName: string;
  date: string;
  time: string;
  players: number;
  amountInr: number;
  paymentId: string | null;
  orderId: string;
  method: string | null;
  status: string;
  createdAt: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width - 88;
    doc.rect(44, 44, w, 68).fill('#111111');
    doc.rect(44, 44, 8, 68).fill('#ff5a1f');
    doc.fillColor('#ff5a1f').font('Helvetica-Bold').fontSize(10).text('ARENA11 // PAYMENT RECEIPT', 64, 58);
    doc.fillColor('#f5f3ee').font('Helvetica-Bold').fontSize(16).text(`Receipt ${p.receiptNo}`, 64, 74);
    doc.fillColor('#b8b5ad').font('Helvetica').fontSize(10).text(`Booking Ref: ${p.reference}   |   Status: ${p.status.toUpperCase()}`, 64, 94);

    let y = 136;
    const rows: [string, string][] = [
      ['CUSTOMER', p.name],
      ['MOBILE', p.mobile],
      ['EMAIL', p.email ?? '-'],
      ['PACKAGE', `${p.packageName} (${p.players} players)`],
      ['SLOT', `${p.date} at ${p.time}`],
      ['ORDER ID', p.orderId],
      ['PAYMENT ID', p.paymentId ?? '-'],
      ['METHOD', (p.method ?? 'online').toUpperCase()],
      ['AMOUNT PAID', `Rs. ${p.amountInr}`],
      ['DATE', new Date(p.createdAt).toLocaleString('en-IN', { timeZone: config.TIME_ZONE })],
    ];
    doc.rect(44, y, w, rows.length * 26 + 16).stroke('#cccccc');
    rows.forEach(([k, v], i) => {
      const ry = y + 14 + i * 26;
      if (i > 0) doc.moveTo(56, ry - 6).lineTo(44 + w - 12, ry - 6).stroke('#eeeeee');
      doc.fillColor('#666666').font('Helvetica-Bold').fontSize(9).text(k, 58, ry);
      doc.fillColor('#111111').font('Helvetica').fontSize(11).text(v, 180, ry - 1, { width: w - 150 });
    });

    doc.end();
  });
}

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;
  const requireCustomer = makeCustomerAuth(db);

  // ---------- public: packages & available slots ----------
  app.get('/public/bookings/packages', async () => ({ packages: BOOKING_PACKAGES }));

  app.get('/public/bookings/slots', async (req, reply) => {
    const { date } = z.object({ date: z.iso.date() }).parse(req.query);
    if (date < todayIn(config.TIME_ZONE)) return reply.code(400).send({ error: 'Pick today or a future date' });
    const { rows } = await db.query<{ time: string }>(
      `SELECT to_char(preferred_time, 'HH24:MI') AS time
         FROM bookings
        WHERE preferred_date = $1
          AND status IN ('pending', 'payment_successful', 'confirmed', 'completed')`,
      [date],
    );
    const taken = new Set(rows.map((r) => r.time));
    return {
      date,
      slots: SLOTS.map((time) => ({ time, available: !taken.has(time) })),
    };
  });

  app.get('/public/payments/config', async () => ({
    gateway: 'razorpay',
    configured: razorpayConfigured(),
    keyId: razorpayConfigured() ? config.RAZORPAY_KEY_ID : 'rzp_test_demo',
    testMode: !razorpayConfigured() && config.NODE_ENV !== 'production',
  }));

  // ---------- customer: create booking & pay ----------
  app.post('/customer/bookings', { preHandler: requireCustomer }, async (req, reply) => {
    const body = z
      .object({
        packageId: z.enum(['1v1', '2v2']),
        date: z.iso.date(),
        time: z.enum(SLOTS),
        players: z.number().int().min(2).max(4).optional(),
        name: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(10).max(20).optional(),
        email: z.email().max(120).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const phone = body.phone || req.customer!.mobile;
    if (!phone) return reply.code(400).send({ error: 'Enter your mobile number (+91) for the booking' });
    if (body.date < todayIn(config.TIME_ZONE)) return reply.code(400).send({ error: 'Pick today or a future date' });
    const pkg = BOOKING_PACKAGES.find((p) => p.id === body.packageId)!;
    if (!pkg.available) return reply.code(400).send({ error: '2 vs 2 TDM is launching soon. Only 1 vs 1 TDM (₹300) is available right now.' });
    const players = body.players ?? pkg.players;
    const reference = 'A11-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const slotKey = `${body.date}|${body.time}`;

    try {
      const { rows } = await db.query(
        `INSERT INTO bookings
          (reference, customer_id, name, phone, email, players, preferred_date, preferred_time, notes, game_mode, package_id, package_name, amount_inr, slot_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
         RETURNING id, reference, package_id AS "packageId", package_name AS "packageName", players,
                   to_char(preferred_date, 'YYYY-MM-DD') AS date, to_char(preferred_time, 'HH24:MI') AS time,
                   amount_inr AS "amountInr", status`,
        [
          reference,
          req.customer!.id,
          body.name,
          phone,
          body.email ?? req.customer!.email ?? null,
          players,
          body.date,
          body.time,
          body.notes ?? null,
          pkg.mode,
          pkg.id,
          pkg.name,
          pkg.amountInr,
          slotKey,
        ],
      );
      await db.query('UPDATE customers SET name = COALESCE($2, name), email = COALESCE($3, email), mobile = COALESCE(mobile, $4) WHERE id = $1', [
        req.customer!.id,
        body.name,
        body.email ?? null,
        phone,
      ]);
      void sendAdminBookingEmail(`ARENA11 New Booking: ${reference} (${body.date} ${body.time})`, [
        `Reference: ${reference}`,
        `Package: ${pkg.name} (${players} players) — ₹${pkg.amountInr}`,
        `Slot: ${body.date} at ${body.time}`,
        `Customer: ${body.name}`,
        `Mobile: ${phone}`,
        `Email: ${body.email ?? req.customer!.email ?? 'N/A'}`,
        `Notes: ${body.notes ?? 'None'}`,
        `Manage: /command/bookings`,
      ]).catch((err) => req.log.warn({ err }, 'booking email alert failed'));
      return reply.code(201).send({ booking: rows[0] });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') return reply.code(409).send({ error: 'This date and time slot is already booked. Pick another slot.' });
      throw err;
    }
  });

  app.post('/customer/payments/create-order', { preHandler: requireCustomer }, async (req, reply) => {
    const { bookingId } = z.object({ bookingId: z.number().int().positive() }).parse(req.body);
    const { rows } = await db.query<{
      id: number;
      reference: string;
      customer_id: number;
      amount_inr: number;
      status: string;
    }>('SELECT id, reference, customer_id, amount_inr, status FROM bookings WHERE id = $1', [bookingId]);
    const booking = rows[0];
    if (!booking || booking.customer_id !== req.customer!.id) return reply.code(404).send({ error: 'Booking not found' });
    if (booking.status !== 'pending') return reply.code(409).send({ error: `Booking is already ${booking.status}` });

    const amountPaise = booking.amount_inr * 100;
    const receiptNo = `RCP-${booking.reference}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    let orderId: string;
    let mode: 'live' | 'test';

    if (razorpayConfigured()) {
      const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64');
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receiptNo }),
      });
      if (!r.ok) return reply.code(502).send({ error: 'Payment gateway unavailable' });
      const data = (await r.json()) as { id: string };
      orderId = data.id;
      mode = 'live';
    } else {
      if (config.NODE_ENV === 'production') {
        return reply.code(503).send({ error: 'Online payments are not configured yet (missing RAZORPAY_KEY_ID/SECRET)' });
      }
      orderId = `order_test_${crypto.randomBytes(6).toString('hex')}`;
      mode = 'test';
    }

    await db.query(
      `INSERT INTO payments (booking_id, customer_id, gateway, order_id, amount_paise, currency, status, receipt_no)
       VALUES ($1, $2, 'razorpay', $3, $4, 'INR', 'created', $5)`,
      [booking.id, req.customer!.id, orderId, amountPaise, receiptNo],
    );

    return {
      orderId,
      amountPaise,
      amountInr: booking.amount_inr,
      currency: 'INR',
      receiptNo,
      keyId: razorpayConfigured() ? config.RAZORPAY_KEY_ID : 'rzp_test_demo',
      mode,
    };
  });

  app.post('/customer/payments/verify', { preHandler: requireCustomer }, async (req, reply) => {
    const body = z
      .object({
        orderId: z.string().min(4),
        paymentId: z.string().min(4),
        signature: z.string().min(4),
        method: z.string().max(40).optional(),
      })
      .parse(req.body);

    const out = await tx(db, async (c) => {
      const { rows } = await c.query<{
        id: number;
        booking_id: number;
        customer_id: number;
        status: string;
        receipt_no: string;
        amount_paise: number;
      }>('SELECT id, booking_id, customer_id, status, receipt_no, amount_paise FROM payments WHERE order_id = $1 FOR UPDATE', [body.orderId]);
      const p = rows[0];
      if (!p || p.customer_id !== req.customer!.id) return { code: 404 as const, error: 'Payment order not found' };
      if (p.status === 'paid') return { code: 409 as const, error: 'Payment already processed' };

      const secret = razorpayConfigured() ? config.RAZORPAY_KEY_SECRET : 'arena11-test-gateway';
      const expectedSig = hmacHex(secret, `${body.orderId}|${body.paymentId}`);
      if (!safeEqualHex(expectedSig, body.signature)) {
        await c.query(`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1`, [p.id]);
        return { code: 400 as const, error: 'Invalid payment signature' };
      }

      await c.query(
        `UPDATE payments SET payment_id = $2, signature = $3, method = $4, status = 'paid', updated_at = now() WHERE id = $1`,
        [p.id, body.paymentId, body.signature, body.method ?? 'upi'],
      );
      await c.query(`UPDATE bookings SET status = 'payment_successful', updated_at = now() WHERE id = $1`, [p.booking_id]);
      return { code: 200 as const, receiptNo: p.receipt_no, bookingId: p.booking_id };
    });

    if (out.code !== 200) return reply.code(out.code).send({ error: out.error });
    const { rows: bk } = await db.query<{
      reference: string;
      name: string;
      phone: string;
      package_name: string;
      date: string;
      time: string;
      amount_inr: number;
    }>(
      `SELECT reference, name, phone, package_name, to_char(preferred_date, 'YYYY-MM-DD') AS date,
              to_char(preferred_time, 'HH24:MI') AS time, amount_inr
         FROM bookings WHERE id = $1`,
      [out.bookingId],
    );
    if (bk[0]) {
      const b = bk[0];
      void sendAdminBookingEmail(`ARENA11 Payment Received: ₹${b.amount_inr} (${b.reference})`, [
        `Receipt: ${out.receiptNo}`,
        `Reference: ${b.reference}`,
        `Amount: ₹${b.amount_inr} (${body.method ?? 'upi'})`,
        `Payment ID: ${body.paymentId}`,
        `Package: ${b.package_name}`,
        `Slot: ${b.date} at ${b.time}`,
        `Customer: ${b.name} (${b.phone})`,
      ]).catch((err) => req.log.warn({ err }, 'payment email alert failed'));
    }
    return { ok: true, status: 'payment_successful', receiptNo: out.receiptNo, receiptPdfUrl: `/api/customer/payments/${out.receiptNo}/pdf` };
  });

  app.post('/customer/payments/fail', { preHandler: requireCustomer }, async (req, reply) => {
    const body = z.object({ orderId: z.string().min(4), reason: z.string().max(200).optional() }).parse(req.body);
    const { rowCount } = await db.query(
      `UPDATE payments SET status = 'failed', raw_payload = $3, updated_at = now()
        WHERE order_id = $1 AND customer_id = $2 AND status = 'created'`,
      [body.orderId, req.customer!.id, JSON.stringify({ reason: body.reason ?? 'cancelled_or_failed' })],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Order not found or already finalized' });
    return { ok: true, status: 'failed' };
  });

  app.get('/customer/payments/:receiptNo/pdf', async (req, reply) => {
    const { receiptNo } = z.object({ receiptNo: z.string().trim().min(4).max(40) }).parse(req.params);
    const { rows } = await db.query(
      `SELECT p.receipt_no, p.order_id, p.payment_id, p.method, p.status, p.amount_paise, p.created_at,
              b.reference, b.name, b.phone, b.email, b.package_name, b.players,
              to_char(b.preferred_date, 'YYYY-MM-DD') AS date, to_char(b.preferred_time, 'HH24:MI') AS time
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
        WHERE p.receipt_no = $1`,
      [receiptNo],
    );
    const r = rows[0];
    if (!r) return reply.code(404).send({ error: 'Receipt not found' });
    const pdf = await renderReceiptPdf({
      receiptNo: r.receipt_no,
      reference: r.reference,
      name: r.name,
      mobile: r.phone,
      email: r.email,
      packageName: r.package_name ?? 'Arena Session',
      date: r.date,
      time: r.time,
      players: r.players,
      amountInr: Math.round(r.amount_paise / 100),
      paymentId: r.payment_id,
      orderId: r.order_id,
      method: r.method,
      status: r.status,
      createdAt: r.created_at,
    });
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${r.receipt_no}.pdf"`)
      .header('cache-control', 'no-store');
    return reply.send(pdf);
  });

  // ---------- Razorpay Webhook ----------
  app.post('/webhooks/razorpay', async (req, reply) => {
    const sig = req.headers['x-razorpay-signature'];
    const secret = config.RAZORPAY_WEBHOOK_SECRET || config.RAZORPAY_KEY_SECRET;
    if (!secret || typeof sig !== 'string' || !req.rawBody) {
      return reply.code(400).send({ error: 'Webhook signature missing or unconfigured' });
    }
    const expected = hmacHex(secret, req.rawBody);
    if (!safeEqualHex(expected, sig)) return reply.code(401).send({ error: 'Invalid webhook signature' });

    const payload = req.body as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string } } };
    };
    const entity = payload.payload?.payment?.entity;
    if (payload.event === 'payment.captured' && entity?.order_id && entity?.id) {
      await tx(db, async (c) => {
        const { rows } = await c.query<{ id: number; booking_id: number; status: string }>(
          'SELECT id, booking_id, status FROM payments WHERE order_id = $1 FOR UPDATE',
          [entity.order_id],
        );
        if (rows[0] && rows[0].status !== 'paid') {
          await c.query(
            `UPDATE payments SET payment_id = $2, method = COALESCE($3, method), status = 'paid', raw_payload = $4, updated_at = now() WHERE id = $1`,
            [rows[0].id, entity.id, entity.method ?? null, JSON.stringify(payload)],
          );
          await c.query(`UPDATE bookings SET status = 'payment_successful', updated_at = now() WHERE id = $1 AND status = 'pending'`, [
            rows[0].booking_id,
          ]);
        }
      });
    } else if (payload.event === 'payment.failed' && entity?.order_id) {
      await db.query(`UPDATE payments SET status = 'failed', raw_payload = $2, updated_at = now() WHERE order_id = $1 AND status = 'created'`, [
        entity.order_id,
        JSON.stringify(payload),
      ]);
    }
    return { ok: true };
  });

  // ---------- Admin: refund booking ----------
  app.post('/admin/bookings/:id/refund', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await tx(db, async (c) => {
      const { rows } = await c.query<{ id: number; status: string }>('SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      await c.query(`UPDATE bookings SET status = 'refunded', updated_at = now() WHERE id = $1`, [id]);
      await c.query(`UPDATE payments SET status = 'refunded', updated_at = now() WHERE booking_id = $1 AND status IN ('paid', 'refund_pending')`, [
        id,
      ]);
    });
    await app.audit(req, 'booking.refunded', { id });
    return { ok: true, status: 'refunded' };
  });
};

export default routes;
