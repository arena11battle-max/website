import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { sendAdminBookingEmail } from '../notify.js';

// Public website data (venue settings, booking enquiries, photo gallery) and the staff tools that manage it.

export const SETTING_KEYS = [
  'address', 'mapsUrl', 'directions', 'phone', 'email', 'whatsapp', 'hours',
  'instagram', 'facebook', 'youtube', 'pricePerHead', 'hardwareStatus',
] as const;

const Url = z.union([z.literal(''), z.url({ protocol: /^https$/ }).max(300)]);
const SettingsBody = z
  .object({
    address: z.string().max(300),
    mapsUrl: Url,
    directions: z.string().max(500),
    phone: z.string().max(30),
    email: z.union([z.literal(''), z.email().max(120)]),
    whatsapp: z.string().max(30),
    hours: z.string().max(120),
    instagram: Url,
    facebook: Url,
    youtube: Url,
    pricePerHead: z.string().max(60),
    hardwareStatus: z.string().max(120),
  })
  .partial();

const BOOKING_STATUS = [
  'new', 'pending', 'payment_successful', 'contacted', 'confirmed',
  'declined', 'cancelled', 'completed', 'refund_pending', 'refunded',
] as const;
const CATEGORIES = ['arena', 'arsenal', 'teams', 'gameplay', 'bts'] as const;
const MAX_IMAGE = 6 * 1024 * 1024;

function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const Id = z.object({ id: z.coerce.number().int().positive() });

const routes: FastifyPluginAsync = async (app) => {
  const db = app.db;

  async function readSettings() {
    const { rows } = await db.query<{ key: string; value: string }>('SELECT key, value FROM site_settings');
    const out: Record<string, string> = Object.fromEntries(SETTING_KEYS.map((k) => [k, '']));
    for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key] = r.value;
    return out;
  }

  // ---------- public ----------
  app.get('/public/site', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { settings: await readSettings() };
  });

  app.post(
    '/public/bookings',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(80),
          phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{8,16}$/, 'Enter a valid phone number'),
          email: z.email().max(120).optional(),
          players: z.number().int().min(config.MIN_PLAYERS).max(config.MAX_PLAYERS),
          date: z.iso.date(),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a valid time'),
          notes: z.string().trim().max(1000).optional(),
          mode: z.enum(['tdm', 'domination', 'last_squad', 'custom']).optional(),
          loadout: z.enum(['AR15', 'Tactical M4', 'Vector', 'UMP45']).optional(),
          website: z.string().max(200).optional(),
        })
        .parse(req.body);
      // Honeypot: real people never fill the hidden "website" field. Pretend success so bots learn nothing.
      if (body.website) return reply.code(201).send({ reference: 'A11-' + crypto.randomBytes(3).toString('hex').toUpperCase() });
      if (body.date < todayIn(config.TIME_ZONE)) return reply.code(400).send({ error: 'Pick today or a future date' });
      const reference = 'A11-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const ipHash = crypto.createHmac('sha256', config.APP_SECRET).update(req.ip).digest('hex').slice(0, 16);
      await db.query(
        `INSERT INTO bookings (reference, name, phone, email, players, preferred_date, preferred_time, notes, game_mode, loadout, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [reference, body.name, body.phone, body.email ?? null, body.players, body.date, body.time, body.notes ?? null, body.mode ?? null, body.loadout ?? null, ipHash],
      );
      void sendAdminBookingEmail(`ARENA11 New Booking Enquiry: ${reference} (${body.date} ${body.time})`, [
        `Reference: ${reference}`,
        `Name: ${body.name}`,
        `Phone: ${body.phone}`,
        `Email: ${body.email ?? 'N/A'}`,
        `Players: ${body.players}`,
        `Slot: ${body.date} at ${body.time}`,
        `Mode: ${body.mode ?? 'N/A'} | Loadout: ${body.loadout ?? 'N/A'}`,
        `Notes: ${body.notes ?? 'None'}`,
        `Manage: /command/bookings`,
      ]).catch((err) => req.log.warn({ err }, 'enquiry email alert failed'));
      return reply.code(201).send({ reference, status: 'enquiry' });
    },
  );

  app.get('/public/gallery', async () => {
    const { rows } = await db.query(
      `SELECT id, caption, category FROM gallery_media WHERE published ORDER BY sort, id DESC LIMIT 200`,
    );
    return {
      items: rows.map((r) => ({ id: `p-${r.id}`, url: `/api/public/gallery/${r.id}/image`, caption: r.caption, category: r.category })),
    };
  });

  app.get('/public/gallery/:id/image', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const { rows } = await db.query<{ mime: string; bytes: Buffer }>('SELECT mime, bytes FROM gallery_media WHERE id = $1 AND published', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    reply.header('cache-control', 'public, max-age=86400').header('x-content-type-options', 'nosniff').type(rows[0].mime);
    return reply.send(rows[0].bytes);
  });

  // ---------- staff: booking enquiries (admins and operators) ----------
  app.register(async (staff) => {
    staff.addHook('preHandler', app.authenticate);

    staff.get('/bookings', async (req) => {
      const q = z.object({ status: z.enum(BOOKING_STATUS).optional() }).parse(req.query);
      const { rows } = await db.query(
        `SELECT b.id, b.reference, b.name, b.phone, b.email, b.players, to_char(b.preferred_date, 'YYYY-MM-DD') AS date,
                to_char(b.preferred_time, 'HH24:MI') AS time, b.notes, b.game_mode AS mode, b.loadout, b.status, b.staff_notes AS "staffNotes",
                s.name AS "handledBy", b.created_at AS "createdAt", b.updated_at AS "updatedAt"
           FROM bookings b LEFT JOIN staff_users s ON s.id = b.handled_by
          WHERE ($1::text IS NULL OR b.status = $1)
          ORDER BY (b.status = 'new') DESC, b.preferred_date, b.id DESC
          LIMIT 300`,
        [q.status ?? null],
      );
      const { rows: counts } = await db.query(`SELECT status, count(*)::int AS n FROM bookings GROUP BY status`);
      return { bookings: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
    });

    staff.patch('/bookings/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = z.object({ status: z.enum(BOOKING_STATUS).optional(), staffNotes: z.string().max(1000).optional() }).parse(req.body);
      const { rows } = await db.query(
        `UPDATE bookings SET status = COALESCE($2, status), staff_notes = COALESCE($3, staff_notes), handled_by = $4, updated_at = now()
          WHERE id = $1 RETURNING id, reference, status`,
        [id, body.status ?? null, body.staffNotes ?? null, req.user!.id],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Enquiry not found' });
      await app.audit(req, 'booking.updated', { id, reference: rows[0].reference, status: body.status });
      return { booking: rows[0] };
    });
  });

  // ---------- admin: website settings and gallery ----------
  app.register(async (admin) => {
    admin.addHook('preHandler', app.requireRole('admin'));

    admin.get('/admin/site', async () => ({ settings: await readSettings() }));

    admin.put('/admin/site', async (req) => {
      const body = SettingsBody.parse(req.body);
      for (const [key, value] of Object.entries(body)) {
        await db.query(
          `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [key, (value as string).trim(), req.user!.id],
        );
      }
      await app.audit(req, 'site.updated', { keys: Object.keys(body) });
      return { settings: await readSettings() };
    });

    admin.get('/admin/gallery', async () => {
      const { rows } = await db.query(
        `SELECT id, caption, category, mime, size, published, sort, created_at AS "createdAt" FROM gallery_media ORDER BY sort, id DESC`,
      );
      return { items: rows };
    });

    // Raw image upload: body is the image itself, caption and category go in the query string.
    admin.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: MAX_IMAGE }, (_req, body, done) =>
      done(null, body),
    );
    admin.post('/admin/gallery', { bodyLimit: MAX_IMAGE }, async (req, reply) => {
      const q = z.object({ caption: z.string().trim().min(1).max(140), category: z.enum(CATEGORIES) }).parse(req.query);
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) return reply.code(400).send({ error: 'Send a JPEG, PNG or WebP image' });
      const mime = sniffImage(buf);
      if (!mime) return reply.code(415).send({ error: 'Only JPEG, PNG or WebP images are accepted' });
      const { rows } = await db.query(
        `INSERT INTO gallery_media (caption, category, mime, bytes, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, caption, category, mime, size, published, sort, created_at AS "createdAt"`,
        [q.caption, q.category, mime, buf, buf.length, req.user!.id],
      );
      await app.audit(req, 'gallery.uploaded', { id: rows[0].id, size: buf.length });
      return reply.code(201).send({ item: rows[0] });
    });

    admin.patch('/admin/gallery/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const body = z
        .object({ caption: z.string().trim().min(1).max(140).optional(), category: z.enum(CATEGORIES).optional(), published: z.boolean().optional() })
        .parse(req.body);
      const { rows } = await db.query(
        `UPDATE gallery_media SET caption = COALESCE($2, caption), category = COALESCE($3, category), published = COALESCE($4, published)
          WHERE id = $1 RETURNING id, caption, category, published`,
        [id, body.caption ?? null, body.category ?? null, body.published ?? null],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Photo not found' });
      await app.audit(req, 'gallery.updated', { id, ...body });
      return { item: rows[0] };
    });

    admin.delete('/admin/gallery/:id', async (req, reply) => {
      const { id } = Id.parse(req.params);
      const { rowCount } = await db.query('DELETE FROM gallery_media WHERE id = $1', [id]);
      if (!rowCount) return reply.code(404).send({ error: 'Photo not found' });
      await app.audit(req, 'gallery.deleted', { id });
      return reply.code(204).send();
    });
  });
};

export default routes;
