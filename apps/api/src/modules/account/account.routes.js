import { Router } from 'express';
import { z } from 'zod';
import { pool, requireDatabase } from '../../db/pool.js';
import { hashPassword, verifyPassword, requireVerifiedIdentity } from '../auth/auth.service.js';

export const accountRoutes = Router();
accountRoutes.use(requireDatabase, requireVerifiedIdentity);

const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,29}$/;

accountRoutes.get('/profile', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.username, u.display_name,
              c.bio, c.avatar_url, c.updated_at
         FROM users u JOIN channels c ON c.owner_user_id = u.id
        WHERE u.id = $1 LIMIT 1`,
      [req.auth.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
    return res.json({ profile: rows[0] });
  } catch (error) { next(error); }
});

accountRoutes.patch('/profile', async (req, res, next) => {
  const parsed = z.object({
    username: z.string().trim().toLowerCase().regex(usernamePattern).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().trim().max(2048).url().nullable().optional()
  }).strict().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
    return res.status(400).json({ error: { code: 'INVALID_PROFILE', message: 'Provide a valid username, display name, bio, or avatar URL.' } });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT username, display_name FROM users WHERE id = $1 FOR UPDATE', [req.auth.userId]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
    }
    const username = parsed.data.username ?? current.rows[0].username;
    const displayName = parsed.data.displayName ?? current.rows[0].display_name;
    await client.query('UPDATE users SET username = $2, display_name = $3, updated_at = now() WHERE id = $1', [req.auth.userId, username, displayName]);
    await client.query(
      `UPDATE channels SET username = $2, display_name = $3,
              bio = COALESCE($4, bio), avatar_url = CASE WHEN $5::boolean THEN $6::text ELSE avatar_url END,
              updated_at = now()
        WHERE owner_user_id = $1`,
      [req.auth.userId, username, displayName, parsed.data.bio ?? null, Object.hasOwn(parsed.data, 'avatarUrl'), parsed.data.avatarUrl ?? null]
    );
    await client.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.username, u.display_name, c.bio, c.avatar_url, c.updated_at
         FROM users u JOIN channels c ON c.owner_user_id = u.id WHERE u.id = $1`,
      [req.auth.userId]
    );
    return res.json({ profile: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'That username is already taken.' } });
    next(error);
  } finally { client.release(); }
});

accountRoutes.get('/settings', async (req, res, next) => {
  try {
    await pool.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [req.auth.userId]);
    const { rows } = await pool.query(
      `SELECT locale, timezone, theme, profile_visibility, discoverable_by_email,
              email_notifications, push_notifications, settings, updated_at
         FROM user_settings WHERE user_id = $1`,
      [req.auth.userId]
    );
    return res.json({ settings: rows[0] });
  } catch (error) { next(error); }
});

accountRoutes.put('/settings', async (req, res, next) => {
  const parsed = z.object({
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    profileVisibility: z.enum(['public', 'private']).optional(),
    discoverableByEmail: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional()
  }).strict().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
    return res.status(400).json({ error: { code: 'INVALID_SETTINGS', message: 'Settings contain unsupported or invalid values.' } });
  }
  const value = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO user_settings (
         user_id, locale, timezone, theme, profile_visibility,
         discoverable_by_email, email_notifications, push_notifications, updated_at
       ) VALUES (
         $1, COALESCE($2, 'en'), COALESCE($3, 'UTC'), COALESCE($4, 'system'),
         COALESCE($5, 'public'), COALESCE($6, false), COALESCE($7, true),
         COALESCE($8, true), now()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         locale = COALESCE($2, user_settings.locale),
         timezone = COALESCE($3, user_settings.timezone),
         theme = COALESCE($4, user_settings.theme),
         profile_visibility = COALESCE($5, user_settings.profile_visibility),
         discoverable_by_email = COALESCE($6, user_settings.discoverable_by_email),
         email_notifications = COALESCE($7, user_settings.email_notifications),
         push_notifications = COALESCE($8, user_settings.push_notifications),
         updated_at = now()
       RETURNING locale, timezone, theme, profile_visibility, discoverable_by_email,
                 email_notifications, push_notifications, settings, updated_at`,
      [req.auth.userId, value.locale ?? null, value.timezone ?? null, value.theme ?? null,
       value.profileVisibility ?? null, value.discoverableByEmail ?? null,
       value.emailNotifications ?? null, value.pushNotifications ?? null]
    );
    return res.json({ settings: rows[0] });
  } catch (error) { next(error); }
});

accountRoutes.post('/password', async (req, res, next) => {
  const parsed = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Your new password must contain 12–128 characters.' } });
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.auth.userId]);
    if (!rows[0]?.password_hash || !(await verifyPassword(rows[0].password_hash, parsed.data.currentPassword))) {
      return res.status(400).json({ error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'The current password is incorrect or this account uses external sign-in.' } });
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.auth.userId, passwordHash]);
    await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.auth.userId]);
    return res.json({ changed: true, sessionsRevoked: true, message: 'Password changed. Sign in again on your devices.' });
  } catch (error) { next(error); }
});

accountRoutes.get('/connections', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT application, external_username, scopes, connected_at
         FROM connected_applications
        WHERE user_id = $1 AND disconnected_at IS NULL
        ORDER BY application`,
      [req.auth.userId]
    );
    const identities = await pool.query(
      `SELECT provider, provider_email, email_verified, created_at, last_used_at
         FROM user_external_identities WHERE user_id = $1 ORDER BY provider`,
      [req.auth.userId]
    );
    return res.json({ connections: rows, identities: identities.rows });
  } catch (error) { next(error); }
});

accountRoutes.delete('/connections/:application', async (req, res, next) => {
  const application = z.enum(['mageus', 'dollareus']).safeParse(req.params.application);
  if (!application.success) return res.status(400).json({ error: { code: 'INVALID_APPLICATION', message: 'Unknown connected application.' } });
  try {
    await pool.query(
      `UPDATE connected_applications SET disconnected_at = now()
        WHERE user_id = $1 AND application = $2 AND disconnected_at IS NULL`,
      [req.auth.userId, application.data]
    );
    return res.json({ disconnected: true, application: application.data });
  } catch (error) { next(error); }
});
