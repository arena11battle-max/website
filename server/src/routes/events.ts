import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { config } from '../config.js';
import { tx } from '../db.js';

export const ALOHA_EVENT = {
  slug: 'aloha-2026',
  name: 'ALOHA 2026 SRMAP UNIVERSITY',
  gameMode: '1 vs 1',
  basePrice: 400,
  currency: 'INR',
} as const;

interface CouponRow {
  id: number;
  code: string;
  discount_type: 'flat' | 'percent';
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  created_at: string;
}

export interface RegistrationRow {
  id: number;
  reference: string;
  event_slug: string;
  event_name: string;
  game_mode: string;
  name: string;
  clg_reg_no: string;
  mobile_number: string;
  email: string;
  base_price: number;
  coupon_code: string | null;
  discount_amount: number;
  final_price: number;
  created_at: string;
}

export function computeDiscount(basePrice: number, discountType: 'flat' | 'percent', discountValue: number) {
  const discountAmount =
    discountType === 'flat'
      ? Math.min(basePrice, Math.max(0, discountValue))
      : Math.min(basePrice, Math.round((basePrice * Math.min(100, Math.max(0, discountValue))) / 100));
  return { discountAmount, finalPrice: Math.max(0, basePrice - discountAmount) };
}

function renderPdfBuffer(build: (doc: PDFKit.PDFDocument) => void, layout: 'portrait' | 'landscape' = 'portrait'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout, margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: config.TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function buildRegistrationPassPdf(r: RegistrationRow): Promise<Buffer> {
  return renderPdfBuffer((doc) => {
    const pageW = doc.page.width - 80;

    // Top tactical header bar
    doc.rect(40, 40, pageW, 74).fill('#111111');
    doc.rect(40, 40, 8, 74).fill('#ff5a1f');
    doc.fillColor('#ff5a1f').font('Helvetica-Bold').fontSize(10).text('ARENA11 // OFFICIAL EVENT PASS', 62, 54);
    doc.fillColor('#f5f3ee').font('Helvetica-Bold').fontSize(18).text(r.event_name, 62, 70);
    doc.fillColor('#b8b5ad').font('Helvetica').fontSize(10).text(`FORMAT: ${r.game_mode}   |   REF: ${r.reference}`, 62, 94);

    // Registration Details Box
    let y = 136;
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(12).text('REGISTRATION DETAILS', 40, y);
    y += 18;
    doc.rect(40, y, pageW, 140).stroke('#cccccc');

    const rows: [string, string][] = [
      ['NAME', r.name],
      ['CLG REG NO', r.clg_reg_no],
      ['MOBILE NUMBER', r.mobile_number],
      ['EMAIL', r.email],
    ];

    rows.forEach(([label, val], idx) => {
      const rowY = y + 16 + idx * 30;
      if (idx > 0) doc.moveTo(56, rowY - 8).lineTo(40 + pageW - 16, rowY - 8).stroke('#eeeeee');
      doc.fillColor('#666666').font('Helvetica-Bold').fontSize(9).text(label, 56, rowY);
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(12).text(val, 200, rowY - 2, { width: pageW - 176 });
    });

    // Payment Summary Box
    y += 164;
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(12).text('MATCH & FEE SUMMARY', 40, y);
    y += 18;
    doc.rect(40, y, pageW, 120).fill('#f8f8f6').stroke('#cccccc');

    const feeRows: [string, string][] = [
      ['GAME MODE', `${r.game_mode} (Single Match)`],
      ['BASE PRICE', `Rs. ${r.base_price}`],
      ['COUPON APPLIED', r.coupon_code ? `${r.coupon_code} (-Rs. ${r.discount_amount})` : 'None'],
    ];

    feeRows.forEach(([label, val], idx) => {
      const rowY = y + 14 + idx * 24;
      doc.fillColor('#666666').font('Helvetica-Bold').fontSize(9).text(label, 56, rowY);
      doc.fillColor('#111111').font('Helvetica').fontSize(11).text(val, 200, rowY - 1);
    });

    doc.moveTo(56, y + 86).lineTo(40 + pageW - 16, y + 86).stroke('#dddddd');
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(11).text('FINAL PAYABLE', 56, y + 96);
    doc.fillColor('#ff5a1f').font('Helvetica-Bold').fontSize(15).text(`Rs. ${r.final_price}`, 200, y + 93);

    // Footer
    y += 145;
    doc.fillColor('#666666').font('Helvetica').fontSize(9).text(`Registered on: ${formatDateTime(r.created_at)}`, 40, y);
    doc.text('Present this registration PDF (or Reference ID) at the ARENA11 desk during ALOHA 2026 SRMAP UNIVERSITY.', 40, y + 16);
  });
}

function buildAllRegistrationsPdf(rows: RegistrationRow[]): Promise<Buffer> {
  return renderPdfBuffer((doc) => {
    const pageW = doc.page.width - 80;
    doc.rect(40, 40, pageW, 56).fill('#111111');
    doc.rect(40, 40, 8, 56).fill('#ff5a1f');
    doc.fillColor('#ff5a1f').font('Helvetica-Bold').fontSize(9).text('ARENA11 // REGISTRATIONS EXPORT', 60, 50);
    doc.fillColor('#f5f3ee').font('Helvetica-Bold').fontSize(15).text(`${ALOHA_EVENT.name} — ${ALOHA_EVENT.gameMode} (Rs. ${ALOHA_EVENT.basePrice})`, 60, 64);

    const totalRevenue = rows.reduce((s, r) => s + r.final_price, 0);
    doc.fillColor('#333333').font('Helvetica').fontSize(9).text(
      `Total Registrations: ${rows.length}   |   Total Amount: Rs. ${totalRevenue}   |   Generated: ${formatDateTime(new Date().toISOString())}`,
      40,
      108,
    );

    const cols = [
      { label: '#', x: 40, w: 24 },
      { label: 'REF', x: 66, w: 72 },
      { label: 'NAME', x: 140, w: 135 },
      { label: 'CLG REG NO', x: 277, w: 105 },
      { label: 'MOBILE NUMBER', x: 384, w: 96 },
      { label: 'EMAIL', x: 482, w: 155 },
      { label: 'COUPON', x: 639, w: 68 },
      { label: 'FEE', x: 709, w: 52 },
    ];

    const drawHeader = (yPos: number) => {
      doc.rect(40, yPos, pageW, 20).fill('#222222');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      for (const c of cols) doc.text(c.label, c.x + 3, yPos + 6, { width: c.w - 6, ellipsis: true });
      return yPos + 22;
    };

    let y = drawHeader(128);
    doc.font('Helvetica').fontSize(8);

    if (rows.length === 0) {
      doc.fillColor('#666666').text('No registrations recorded yet.', 44, y + 10);
      return;
    }

    rows.forEach((r, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        y = drawHeader(40);
      }
      if (idx % 2 === 1) doc.rect(40, y - 2, pageW, 18).fill('#f6f6f4');
      doc.fillColor('#111111').font('Helvetica').fontSize(8);
      const vals = [
        String(idx + 1),
        r.reference,
        r.name,
        r.clg_reg_no,
        r.mobile_number,
        r.email,
        r.coupon_code ? `${r.coupon_code} (-${r.discount_amount})` : '-',
        `Rs.${r.final_price}`,
      ];
      cols.forEach((c, i) => {
        doc.text(vals[i], c.x + 3, y + 3, { width: c.w - 6, height: 14, ellipsis: true });
      });
      y += 18;
    });
  }, 'landscape');
}

const Id = z.object({ id: z.coerce.number().int().positive() });

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;

  // ---------- public ----------
  app.get('/public/events/aloha-2026', async () => ({ event: ALOHA_EVENT }));

  app.post('/public/events/aloha-2026/validate-coupon', async (req, reply) => {
    const { code } = z.object({ code: z.string().trim().min(1).max(32) }).parse(req.body);
    const normalized = code.toUpperCase();
    const { rows } = await db.query<CouponRow>(
      `SELECT * FROM event_coupons WHERE event_slug = $1 AND code = $2`,
      [ALOHA_EVENT.slug, normalized],
    );
    const coupon = rows[0];
    if (!coupon || !coupon.active) return reply.code(404).send({ error: 'Invalid or inactive coupon code' });
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return reply.code(400).send({ error: 'This coupon has reached its usage limit' });
    }
    const { discountAmount, finalPrice } = computeDiscount(ALOHA_EVENT.basePrice, coupon.discount_type, coupon.discount_value);
    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      basePrice: ALOHA_EVENT.basePrice,
      discountAmount,
      finalPrice,
    };
  });

  app.post(
    '/public/events/aloha-2026/register',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().trim().min(2, 'Enter your full name').max(80),
          clgRegNo: z.string().trim().min(2, 'Enter your college registration number').max(40),
          mobileNumber: z.string().trim().regex(/^\+?[0-9][0-9\s-]{8,16}$/, 'Enter a valid mobile number'),
          email: z.email('Enter a valid email address').max(120),
          couponCode: z.string().trim().max(32).optional(),
        })
        .parse(req.body);

      const couponCode = body.couponCode ? body.couponCode.toUpperCase() : null;
      const clgRegNo = body.clgRegNo.toUpperCase();
      const reference = 'ALH-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const ipHash = crypto.createHmac('sha256', config.APP_SECRET).update(req.ip).digest('hex').slice(0, 16);

      const registration = await tx(db, async (c) => {
        let discountAmount = 0;
        let finalPrice: number = ALOHA_EVENT.basePrice;
        let appliedCoupon: string | null = null;

        if (couponCode) {
          const { rows: cRows } = await c.query<CouponRow>(
            `SELECT * FROM event_coupons WHERE event_slug = $1 AND code = $2 FOR UPDATE`,
            [ALOHA_EVENT.slug, couponCode],
          );
          const coupon = cRows[0];
          if (!coupon || !coupon.active) {
            throw Object.assign(new Error('Invalid or inactive coupon code'), { statusCode: 400 });
          }
          if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
            throw Object.assign(new Error('This coupon has reached its usage limit'), { statusCode: 400 });
          }
          ({ discountAmount, finalPrice } = computeDiscount(ALOHA_EVENT.basePrice, coupon.discount_type, coupon.discount_value));
          appliedCoupon = coupon.code;
          await c.query(`UPDATE event_coupons SET used_count = used_count + 1 WHERE id = $1`, [coupon.id]);
        }

        const { rows } = await c.query<RegistrationRow>(
          `INSERT INTO event_registrations
            (reference, event_slug, event_name, game_mode, name, clg_reg_no, mobile_number, email, base_price, coupon_code, discount_amount, final_price, ip_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, reference, event_slug, event_name, game_mode, name, clg_reg_no, mobile_number, email, base_price, coupon_code, discount_amount, final_price, created_at`,
          [
            reference,
            ALOHA_EVENT.slug,
            ALOHA_EVENT.name,
            ALOHA_EVENT.gameMode,
            body.name,
            clgRegNo,
            body.mobileNumber,
            body.email,
            ALOHA_EVENT.basePrice,
            appliedCoupon,
            discountAmount,
            finalPrice,
            ipHash,
          ],
        );
        return rows[0];
      });

      return reply.code(201).send({
        registration: {
          reference: registration.reference,
          eventName: registration.event_name,
          gameMode: registration.game_mode,
          name: registration.name,
          clgRegNo: registration.clg_reg_no,
          mobileNumber: registration.mobile_number,
          email: registration.email,
          basePrice: registration.base_price,
          couponCode: registration.coupon_code,
          discountAmount: registration.discount_amount,
          finalPrice: registration.final_price,
          createdAt: registration.created_at,
        },
        pdfUrl: `/api/public/events/aloha-2026/registrations/${registration.reference}/pdf`,
      });
    },
  );

  app.get('/public/events/aloha-2026/registrations/:reference/pdf', async (req, reply) => {
    const { reference } = z.object({ reference: z.string().trim().min(3).max(32) }).parse(req.params);
    const { rows } = await db.query<RegistrationRow>(
      `SELECT id, reference, event_slug, event_name, game_mode, name, clg_reg_no, mobile_number, email, base_price, coupon_code, discount_amount, final_price, created_at
         FROM event_registrations
        WHERE event_slug = $1 AND reference = $2`,
      [ALOHA_EVENT.slug, reference.toUpperCase()],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Registration not found' });
    const pdf = await buildRegistrationPassPdf(rows[0]);
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="ALOHA-2026-${rows[0].reference}.pdf"`)
      .header('cache-control', 'no-store');
    return reply.send(pdf);
  });

  // ---------- staff (admins and operators): view registrations & export PDF ----------
  app.register(async (staff) => {
    staff.addHook('preHandler', app.authenticate);

    staff.get('/events/aloha-2026/registrations', async () => {
      const { rows } = await db.query<RegistrationRow>(
        `SELECT id, reference, event_slug, event_name, game_mode, name, clg_reg_no, mobile_number, email, base_price, coupon_code, discount_amount, final_price, created_at
           FROM event_registrations
          WHERE event_slug = $1
          ORDER BY id DESC
          LIMIT 500`,
        [ALOHA_EVENT.slug],
      );
      const totalRevenue = rows.reduce((s, r) => s + r.final_price, 0);
      const couponsUsed = rows.filter((r) => r.coupon_code !== null).length;
      return {
        event: ALOHA_EVENT,
        registrations: rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          name: r.name,
          clgRegNo: r.clg_reg_no,
          mobileNumber: r.mobile_number,
          email: r.email,
          basePrice: r.base_price,
          couponCode: r.coupon_code,
          discountAmount: r.discount_amount,
          finalPrice: r.final_price,
          createdAt: r.created_at,
        })),
        summary: { total: rows.length, couponsUsed, totalRevenue },
      };
    });

    staff.get('/events/aloha-2026/registrations/pdf', async (_req, reply) => {
      const { rows } = await db.query<RegistrationRow>(
        `SELECT id, reference, event_slug, event_name, game_mode, name, clg_reg_no, mobile_number, email, base_price, coupon_code, discount_amount, final_price, created_at
           FROM event_registrations
          WHERE event_slug = $1
          ORDER BY id DESC
          LIMIT 1000`,
        [ALOHA_EVENT.slug],
      );
      const pdf = await buildAllRegistrationsPdf(rows);
      reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', 'attachment; filename="ALOHA-2026-Registrations.pdf"')
        .header('cache-control', 'no-store');
      return reply.send(pdf);
    });
  });

  // ---------- admin only: manage coupons ----------
  app.register(async (admin) => {
    admin.addHook('preHandler', app.requireRole('admin'));

    admin.get('/admin/events/aloha-2026/coupons', async () => {
      const { rows } = await db.query<CouponRow>(
        `SELECT id, code, discount_type, discount_value, max_uses, used_count, active, created_at
           FROM event_coupons
          WHERE event_slug = $1
          ORDER BY id DESC`,
        [ALOHA_EVENT.slug],
      );
      return {
        coupons: rows.map((c) => ({
          id: c.id,
          code: c.code,
          discountType: c.discount_type,
          discountValue: c.discount_value,
          maxUses: c.max_uses,
          usedCount: c.used_count,
          active: c.active,
          createdAt: c.created_at,
        })),
      };
    });

    admin.post('/admin/events/aloha-2026/coupons', async (req, reply) => {
      const body = z
        .object({
          code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _ only'),
          discountType: z.enum(['flat', 'percent']),
          discountValue: z.number().int().positive(),
          maxUses: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);

      if (body.discountType === 'percent' && body.discountValue > 100) {
        return reply.code(400).send({ error: 'Percentage discount cannot exceed 100%' });
      }
      if (body.discountType === 'flat' && body.discountValue > ALOHA_EVENT.basePrice) {
        return reply.code(400).send({ error: `Flat discount cannot exceed Rs. ${ALOHA_EVENT.basePrice}` });
      }

      const code = body.code.toUpperCase();
      const { rows } = await db.query<CouponRow>(
        `INSERT INTO event_coupons (event_slug, code, discount_type, discount_value, max_uses, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, code, discount_type, discount_value, max_uses, used_count, active, created_at`,
        [ALOHA_EVENT.slug, code, body.discountType, body.discountValue, body.maxUses ?? null, req.user!.id],
      );
      await app.audit(req, 'event_coupon.created', { code, discountType: body.discountType, discountValue: body.discountValue });
      const c = rows[0];
      return reply.code(201).send({
        coupon: {
          id: c.id,
          code: c.code,
          discountType: c.discount_type,
          discountValue: c.discount_value,
          maxUses: c.max_uses,
          usedCount: c.used_count,
          active: c.active,
          createdAt: c.created_at,
        },
      });
    });

    admin.patch('/admin/events/aloha-2026/coupons/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = z.object({ active: z.boolean().optional(), maxUses: z.number().int().positive().nullable().optional() }).parse(req.body);
      const { rows } = await db.query<CouponRow>(
        `UPDATE event_coupons
            SET active = COALESCE($2, active),
                max_uses = CASE WHEN $3::boolean THEN $4 ELSE max_uses END
          WHERE id = $1 AND event_slug = $5
          RETURNING id, code, discount_type, discount_value, max_uses, used_count, active, created_at`,
        [id, body.active ?? null, body.maxUses !== undefined, body.maxUses ?? null, ALOHA_EVENT.slug],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Coupon not found' });
      await app.audit(req, 'event_coupon.updated', { id, code: rows[0].code, active: rows[0].active });
      const c = rows[0];
      return {
        coupon: {
          id: c.id,
          code: c.code,
          discountType: c.discount_type,
          discountValue: c.discount_value,
          maxUses: c.max_uses,
          usedCount: c.used_count,
          active: c.active,
          createdAt: c.created_at,
        },
      };
    });

    admin.delete('/admin/events/aloha-2026/coupons/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const { rows } = await db.query<{ id: number; code: string }>(
        `DELETE FROM event_coupons WHERE id = $1 AND event_slug = $2 RETURNING id, code`,
        [id, ALOHA_EVENT.slug],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Coupon not found' });
      await app.audit(req, 'event_coupon.deleted', { id, code: rows[0].code });
      return reply.code(204).send();
    });
  });
};

export default routes;
