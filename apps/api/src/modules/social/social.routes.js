import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity, verifyAccessToken } from '../auth/auth.service.js';

export const socialRoutes = Router();
socialRoutes.use(requireDatabase);

const uuid = z.string().uuid();
const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const socialWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many social actions. Try again later.' } }
});

socialRoutes.get('/feed', requireVerifiedIdentity, async (req, res, next) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid feed limit.' } });
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.slug, a.title, a.subtitle, a.excerpt, a.category, a.language, a.tags,
              a.cover_image_url, a.published_at, a.updated_at,
              c.username AS author_username, c.display_name AS author_name, c.avatar_url AS author_avatar_url
         FROM articles a
         JOIN channels c ON c.id = a.channel_id
        WHERE a.status = 'published' AND a.published_at IS NOT NULL
          AND (c.owner_user_id = $1 OR EXISTS (
            SELECT 1 FROM channel_follows f
             WHERE f.follower_user_id = $1 AND f.followed_channel_id = c.id
          ))
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT $2`,
      [req.auth.userId, query.data.limit]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ items: rows });
  } catch (error) { next(error); }
});

// Public profile data is readable without a session. Draft and archived business content is never exposed.
socialRoutes.get('/profiles/:username', async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  if (!usernamePattern.test(username)) {
    return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.username, c.display_name, c.bio, c.avatar_url, c.created_at,
              (SELECT count(*)::int FROM channel_follows f WHERE f.followed_channel_id = c.id) AS follower_count,
              (SELECT count(*)::int FROM channel_follows f JOIN channels followed ON followed.id = f.followed_channel_id WHERE f.follower_user_id = c.owner_user_id) AS following_count,
              COALESCE(us.profile_visibility, 'public') AS profile_visibility
         FROM channels c
         LEFT JOIN user_settings us ON us.user_id = c.owner_user_id
        WHERE c.username = $1
        LIMIT 1`,
      [username]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
    const profile = rows[0];
    const visibility = profile.profile_visibility;
    delete profile.profile_visibility;
    if (visibility === 'private') {
      const authorization = req.headers.authorization ?? '';
      const match = /^Bearer\\s+(.+)$/i.exec(authorization);
      let viewerUserId = null;
      if (match) {
        try { viewerUserId = (await verifyAccessToken(match[1])).userId; } catch { /* Treat invalid tokens as anonymous visitors. */ }
      }
      const owner = await pool.query('SELECT owner_user_id FROM channels WHERE id = $1', [profile.id]);
      if (!viewerUserId || viewerUserId !== owner.rows[0]?.owner_user_id) {
        return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
      }
    }
    const [locations, storefronts, menus, articles] = await Promise.all([
      pool.query(
        `SELECT l.id, l.name, l.slug, l.address, l.google_place_id, l.latitude, l.longitude, l.phone, l.opening_hours, l.is_primary
           FROM business_locations l
          WHERE l.channel_id = $1
          ORDER BY l.is_primary DESC, l.name ASC`,
        [profile.id]
      ),
      pool.query(
        `SELECT s.id, s.name, s.slug, s.description, s.fulfillment_type, s.location_id,
                l.name AS location_name, l.slug AS location_slug,
                (SELECT count(*)::int FROM store_products p WHERE p.storefront_id = s.id AND p.status = 'published') AS product_count,
                (SELECT count(*)::int FROM store_services v WHERE v.storefront_id = s.id AND v.status = 'published') AS service_count,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description, 'image_url', p.image_url, 'price_amount', p.price_amount, 'currency', p.currency) ORDER BY p.created_at DESC), '[]'::jsonb)
                   FROM store_products p WHERE p.storefront_id = s.id AND p.status = 'published') AS products,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'slug', v.slug, 'description', v.description, 'image_url', v.image_url, 'price_amount', v.price_amount, 'currency', v.currency, 'booking_url', v.booking_url) ORDER BY v.created_at DESC), '[]'::jsonb)
                   FROM store_services v WHERE v.storefront_id = s.id AND v.status = 'published') AS services
           FROM storefronts s
           LEFT JOIN business_locations l ON l.id = s.location_id AND l.channel_id = s.channel_id
          WHERE s.channel_id = $1 AND s.status = 'published'
          ORDER BY s.created_at DESC`,
        [profile.id]
      ),
      pool.query(
        `SELECT m.id, m.name, m.slug, m.description, m.pdf_url, m.location_id,
                l.name AS location_name, l.slug AS location_slug,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'description', i.description, 'image_url', i.image_url, 'price_amount', i.price_amount, 'currency', i.currency, 'category', i.category, 'is_available', i.is_available) ORDER BY i.sort_order, i.created_at), '[]'::jsonb)
                   FROM location_menu_items i WHERE i.menu_id = m.id AND i.is_available) AS items
           FROM location_menus m
           JOIN business_locations l ON l.id = m.location_id AND l.channel_id = m.channel_id
          WHERE m.channel_id = $1 AND m.status = 'published'
          ORDER BY l.is_primary DESC, l.name ASC, m.name ASC`,
        [profile.id]
      ),
      pool.query(
        `SELECT a.id, a.slug, a.title, a.subtitle, a.excerpt, a.category, a.cover_image_url, a.published_at
           FROM articles a
          WHERE a.channel_id = $1 AND a.status = 'published' AND a.published_at IS NOT NULL
          ORDER BY a.published_at DESC, a.id DESC
          LIMIT 30`,
        [profile.id]
      )
    ]);
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.set('X-Robots-Tag', 'index, follow');
    return res.json({
      profile,
      locations: locations.rows,
      storefronts: storefronts.rows,
      menus: menus.rows,
      articles: articles.rows
    });
  } catch (error) { next(error); }
});

// The account owner may update only the channel tied to their authenticated user ID.
socialRoutes.patch('/me/profile', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const input = z.object({
    displayName: z.string().trim().min(1).max(100),
    bio: z.string().trim().max(1000),
    avatarUrl: z.union([
      z.string().url().max(2048).refine((value) => value.startsWith('https://'), 'Avatar URLs must use HTTPS.'),
      z.null()
    ])
  }).strict().safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ error: { code: 'INVALID_PROFILE', message: 'Enter a display name, a bio up to 1,000 characters, and an optional HTTPS avatar URL.' } });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const channel = await client.query(
      'SELECT id FROM channels WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
      [req.auth.userId]
    );
    if (!channel.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Your public profile could not be found.' } });
    }
    await client.query('UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1', [req.auth.userId, input.data.displayName]);
    const updated = await client.query(
      `UPDATE channels
          SET display_name = $2, bio = $3, avatar_url = $4, updated_at = now()
        WHERE id = $1 AND owner_user_id = $5
        RETURNING id, username, display_name, bio, avatar_url, created_at`,
      [channel.rows[0].id, input.data.displayName, input.data.bio, input.data.avatarUrl, req.auth.userId]
    );
    await client.query('COMMIT');
    return res.json({ profile: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

socialRoutes.get('/profiles/:username/following', requireVerifiedIdentity, async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  if (!usernamePattern.test(username)) {
    return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM channel_follows f
         JOIN channels c ON c.id = f.followed_channel_id
         WHERE c.username = $1 AND f.follower_user_id = $2
       ) AS following`,
      [username, req.auth.userId]
    );
    return res.json({ following: rows[0].following });
  } catch (error) { next(error); }
});

socialRoutes.post('/profiles/:username/follow', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  if (!usernamePattern.test(username)) {
    return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, owner_user_id FROM channels WHERE username = $1 LIMIT 1',
      [username]
    );
    const channel = rows[0];
    if (!channel) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
    if (channel.owner_user_id === req.auth.userId) {
      return res.status(400).json({ error: { code: 'CANNOT_FOLLOW_SELF', message: 'You cannot follow your own profile.' } });
    }
    const followed = await pool.query(
      `INSERT INTO channel_follows (follower_user_id, followed_channel_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_user_id, followed_channel_id) DO NOTHING
       RETURNING followed_channel_id`,
      [req.auth.userId, channel.id]
    );
    if (followed.rowCount && channel.owner_user_id) {
      await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
         VALUES ($1, $2, 'follow', 'channel', $3)`,
        [channel.owner_user_id, req.auth.userId, channel.id]
      );
    }
    const count = await pool.query('SELECT count(*)::int AS count FROM channel_follows WHERE followed_channel_id = $1', [channel.id]);
    return res.status(200).json({ following: true, followerCount: count.rows[0].count });
  } catch (error) { next(error); }
});

socialRoutes.delete('/profiles/:username/follow', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  if (!usernamePattern.test(username)) {
    return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
  }
  try {
    const { rows } = await pool.query('SELECT id FROM channels WHERE username = $1 LIMIT 1', [username]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found.' } });
    await pool.query(
      'DELETE FROM channel_follows WHERE follower_user_id = $1 AND followed_channel_id = $2',
      [req.auth.userId, rows[0].id]
    );
    const count = await pool.query('SELECT count(*)::int AS count FROM channel_follows WHERE followed_channel_id = $1', [rows[0].id]);
    return res.json({ following: false, followerCount: count.rows[0].count });
  } catch (error) { next(error); }
});

socialRoutes.get('/notifications', requireVerifiedIdentity, async (req, res, next) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid notification limit.' } });
  try {
    const [notifications, unread] = await Promise.all([
      pool.query(
        `SELECT n.id, n.type, n.entity_type, n.entity_id, n.payload, n.read_at, n.created_at,
                u.username AS actor_username, u.display_name AS actor_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.actor_user_id
          WHERE n.recipient_user_id = $1
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT $2`,
        [req.auth.userId, query.data.limit]
      ),
      pool.query('SELECT count(*)::int AS count FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL', [req.auth.userId])
    ]);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ notifications: notifications.rows, unreadCount: unread.rows[0].count });
  } catch (error) { next(error); }
});

socialRoutes.patch('/notifications/:notificationId/read', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.notificationId);
  if (!id.success) return res.status(404).json({ error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' } });
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND recipient_user_id = $2
        RETURNING id, read_at`,
      [id.data, req.auth.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' } });
    return res.json({ notification: rows[0] });
  } catch (error) { next(error); }
});

socialRoutes.patch('/notifications/read-all', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET read_at = now() WHERE recipient_user_id = $1 AND read_at IS NULL',
      [req.auth.userId]
    );
    return res.json({ markedRead: result.rowCount });
  } catch (error) { next(error); }
});


// Business owners manage only locations belonging to their own channel.
const locationInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  address: z.string().trim().max(500).default(''),
  googlePlaceId: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  openingHours: z.record(z.string(), z.unknown()).default({}),
  isPrimary: z.boolean().default(false)
}).strict().refine((value) => (value.latitude == null) === (value.longitude == null), {
  message: 'Latitude and longitude must be supplied together.'
});

socialRoutes.get('/me/business/locations', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.slug, l.address, l.google_place_id, l.latitude, l.longitude,
              l.phone, l.opening_hours, l.is_primary, l.created_at, l.updated_at
         FROM business_locations l
         JOIN channels c ON c.id = l.channel_id
        WHERE c.owner_user_id = $1
        ORDER BY l.is_primary DESC, l.name ASC`,
      [req.auth.userId]
    );
    return res.json({ locations: rows });
  } catch (error) { next(error); }
});

socialRoutes.post('/me/business/locations', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const input = locationInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: { code: 'INVALID_LOCATION', message: 'Check the location name, URL slug, address, coordinates, and opening hours.' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const channel = await client.query('SELECT id FROM channels WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE', [req.auth.userId]);
    if (!channel.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'Your public profile could not be found.' } });
    }
    const channelId = channel.rows[0].id;
    if (input.data.isPrimary) await client.query('UPDATE business_locations SET is_primary = false, updated_at = now() WHERE channel_id = $1', [channelId]);
    const { rows } = await client.query(
      `INSERT INTO business_locations
         (channel_id, name, slug, address, google_place_id, latitude, longitude, phone, opening_hours, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id, name, slug, address, google_place_id, latitude, longitude, phone, opening_hours, is_primary, created_at, updated_at`,
      [channelId, input.data.name, input.data.slug, input.data.address, input.data.googlePlaceId ?? null,
       input.data.latitude ?? null, input.data.longitude ?? null, input.data.phone ?? null,
       JSON.stringify(input.data.openingHours), input.data.isPrimary]
    );
    await client.query('COMMIT');
    return res.status(201).json({ location: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'LOCATION_CONFLICT', message: 'A location with this slug or Google place already exists.' } });
    return next(error);
  } finally { client.release(); }
});

socialRoutes.patch('/me/business/locations/:locationId', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.locationId);
  const input = locationInput.partial().strict().safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' } });
  if (!input.success || Object.keys(input.data ?? {}).length === 0) return res.status(400).json({ error: { code: 'INVALID_LOCATION', message: 'Provide valid location fields to update.' } });
  if (input.data.latitude !== undefined || input.data.longitude !== undefined) {
    const current = await pool.query(
      `SELECT l.latitude, l.longitude FROM business_locations l JOIN channels c ON c.id = l.channel_id
        WHERE l.id = $1 AND c.owner_user_id = $2`,
      [id.data, req.auth.userId]
    );
    if (!current.rows[0]) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' } });
    const latitude = input.data.latitude === undefined ? current.rows[0].latitude : input.data.latitude;
    const longitude = input.data.longitude === undefined ? current.rows[0].longitude : input.data.longitude;
    if ((latitude == null) !== (longitude == null)) return res.status(400).json({ error: { code: 'INVALID_COORDINATES', message: 'Latitude and longitude must be supplied together.' } });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      `SELECT l.channel_id FROM business_locations l JOIN channels c ON c.id = l.channel_id
        WHERE l.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF l`,
      [id.data, req.auth.userId]
    );
    if (!owner.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' } });
    }
    if (input.data.isPrimary) await client.query('UPDATE business_locations SET is_primary = false, updated_at = now() WHERE channel_id = $1', [owner.rows[0].channel_id]);
    const fields = input.data;
    const { rows } = await client.query(
      `UPDATE business_locations SET
         name = COALESCE($3, name), slug = COALESCE($4, slug), address = COALESCE($5, address),
         google_place_id = CASE WHEN $6::boolean THEN $7 ELSE google_place_id END,
         latitude = CASE WHEN $8::boolean THEN $9 ELSE latitude END,
         longitude = CASE WHEN $10::boolean THEN $11 ELSE longitude END,
         phone = CASE WHEN $12::boolean THEN $13 ELSE phone END,
         opening_hours = CASE WHEN $14::boolean THEN $15::jsonb ELSE opening_hours END,
         is_primary = COALESCE($16, is_primary), updated_at = now()
       WHERE id = $1 AND channel_id = $2
       RETURNING id, name, slug, address, google_place_id, latitude, longitude, phone, opening_hours, is_primary, created_at, updated_at`,
      [id.data, owner.rows[0].channel_id, fields.name ?? null, fields.slug ?? null, fields.address ?? null,
       fields.googlePlaceId !== undefined, fields.googlePlaceId ?? null,
       fields.latitude !== undefined, fields.latitude ?? null,
       fields.longitude !== undefined, fields.longitude ?? null,
       fields.phone !== undefined, fields.phone ?? null,
       fields.openingHours !== undefined, JSON.stringify(fields.openingHours ?? {}),
       fields.isPrimary ?? null]
    );
    await client.query('COMMIT');
    return res.json({ location: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'LOCATION_CONFLICT', message: 'A location with this slug or Google place already exists.' } });
    return next(error);
  } finally { client.release(); }
});

socialRoutes.delete('/me/business/locations/:locationId', socialWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.locationId);
  if (!id.success) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT l.id, l.channel_id, l.is_primary FROM business_locations l
        JOIN channels c ON c.id = l.channel_id
       WHERE l.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF l`,
      [id.data, req.auth.userId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' } });
    }
    const attachedMenus = await client.query('SELECT 1 FROM location_menus WHERE location_id = $1 LIMIT 1', [id.data]);
    if (attachedMenus.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'LOCATION_HAS_MENUS', message: 'Move or remove this location’s menus before deleting the location.' } });
    }
    await client.query('DELETE FROM business_locations WHERE id = $1 AND channel_id = $2', [id.data, rows[0].channel_id]);
    if (rows[0].is_primary) {
      await client.query(
        `UPDATE business_locations SET is_primary = true, updated_at = now()
          WHERE id = (SELECT id FROM business_locations WHERE channel_id = $1 ORDER BY created_at ASC LIMIT 1)`,
        [rows[0].channel_id]
      );
    }
    await client.query('COMMIT');
    return res.json({ deleted: true, id: id.data });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});
