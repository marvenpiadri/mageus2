import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, requireDatabase } from '../../db/pool.js';
import {
  clearRefreshCookie, createRefreshToken, hashPassword, hashRefreshToken,
  issueAccessToken, readRefreshCookie, refreshExpiry, setRefreshCookie,
  verifyPassword, requireAuthConfiguration, requireVerifiedIdentity
} from './auth.service.js';

export const authRoutes = Router();
const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRoutes.use(requireDatabase);
authRoutes.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !req.app.locals.allowedOrigins?.includes(origin)) {
    return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } });
  }
  next();
});
const authWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } }
});

authRoutes.post('/register', authWriteLimit, requireAuthConfiguration, async (req, res, next) => {
  const parsed = z.object({
    username: z.string().trim().toLowerCase().regex(usernamePattern),
    displayName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().regex(emailPattern).max(254),
    password: z.string().min(12).max(128)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_REGISTRATION', message: 'Check username, name, email, and password (12–128 characters).' } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await hashPassword(parsed.data.password);
    const { rows } = await client.query(
      `INSERT INTO users (email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, display_name`,
      [parsed.data.email, parsed.data.username, parsed.data.displayName, passwordHash]
    );
    const user = rows[0];
    await client.query(
      `INSERT INTO channels (owner_user_id, username, display_name)
       VALUES ($1, $2, $3)`,
      [user.id, user.username, user.display_name]
    );
    const refreshToken = createRefreshToken();
    await client.query(
      'INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashRefreshToken(refreshToken), refreshExpiry()]
    );
    await client.query('COMMIT');
    setRefreshCookie(res, refreshToken);
    return res.status(201).json({ user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name }, accessToken: await issueAccessToken(user), tokenType: 'Bearer', expiresIn: 900 });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'That email or username is already in use.' } });
    next(error);
  } finally { client.release(); }
});

authRoutes.post('/login', authWriteLimit, requireAuthConfiguration, async (req, res, next) => {
  const parsed = z.object({
    credential: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Enter your username or email and password.' } });
  try {
    const credential = parsed.data.credential.toLowerCase();
    const { rows } = await pool.query(
      `SELECT id, email, username, display_name, password_hash
         FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
      [credential]
    );
    const user = rows[0];
    if (!user || !user.password_hash || !(await verifyPassword(user.password_hash, parsed.data.password))) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'The credentials are incorrect.' } });
    }
    const refreshToken = createRefreshToken();
    await pool.query(
      'INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashRefreshToken(refreshToken), refreshExpiry()]
    );
    setRefreshCookie(res, refreshToken);
    return res.json({
      user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name },
      accessToken: await issueAccessToken(user),
      tokenType: 'Bearer',
      expiresIn: 900
    });
  } catch (error) { next(error); }
});

authRoutes.post('/refresh', authWriteLimit, requireAuthConfiguration, async (req, res, next) => {
  const token = readRefreshCookie(req);
  if (!token) return res.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'Sign in to continue.' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT s.id, s.user_id, u.username, u.email, u.display_name
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        FOR UPDATE OF s`,
      [hashRefreshToken(token)]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      clearRefreshCookie(res);
      return res.status(401).json({ error: { code: 'REFRESH_EXPIRED', message: 'Your session has expired. Sign in again.' } });
    }
    const user = current.rows[0];
    const nextToken = createRefreshToken();
    await client.query('UPDATE auth_sessions SET revoked_at = now(), last_used_at = now() WHERE id = $1', [current.rows[0].id]);
    await client.query(
      'INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.user_id, hashRefreshToken(nextToken), refreshExpiry()]
    );
    await client.query('COMMIT');
    setRefreshCookie(res, nextToken);
    return res.json({
      user: { id: user.user_id, email: user.email, username: user.username, displayName: user.display_name },
      accessToken: await issueAccessToken({ id: user.user_id, username: user.username }),
      tokenType: 'Bearer',
      expiresIn: 900
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

authRoutes.post('/logout', requireDatabase, async (req, res, next) => {
  try {
    const token = readRefreshCookie(req);
    if (token) await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [hashRefreshToken(token)]);
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (error) { next(error); }
});

authRoutes.get('/me', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, username, display_name FROM users WHERE id = $1 LIMIT 1',
      [req.auth.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account is no longer available.' } });
    return res.json({ user: { id: rows[0].id, email: rows[0].email, username: rows[0].username, displayName: rows[0].display_name } });
  } catch (error) { next(error); }
});
