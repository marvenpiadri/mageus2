import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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


const oauthProviderConfig = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: () => process.env.GOOGLE_REDIRECT_URI,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: 'openid email profile'
  },
  facebook: {
    clientId: () => process.env.FACEBOOK_CLIENT_ID,
    clientSecret: () => process.env.FACEBOOK_CLIENT_SECRET,
    redirectUri: () => process.env.FACEBOOK_REDIRECT_URI,
    authorizationEndpoint: 'https://www.facebook.com/v22.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v22.0/oauth/access_token',
    scopes: 'email,public_profile'
  }
};
const oauthCookieName = 'mageus_oauth_state';
const oauthCookiePath = '/api/v1/auth/oauth';

function oauthCookie(res, value, maxAge = 600) {
  const parts = [`${oauthCookieName}=${encodeURIComponent(value)}`, 'HttpOnly', `Path=${oauthCookiePath}`, 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
function readOauthCookie(req) {
  const entry = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${oauthCookieName}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(oauthCookieName.length + 1)); } catch { return null; }
}
function providerConfigured(provider) {
  const config = oauthProviderConfig[provider];
  return Boolean(config && config.clientId() && config.clientSecret() && config.redirectUri());
}
function oauthErrorRedirect(req, code) {
  const origin = req.app.locals.allowedOrigins?.[0] || 'http://localhost:4200';
  const url = new URL('/sign-in', origin);
  url.searchParams.set('oauthError', code);
  return url.toString();
}

authRoutes.get('/oauth/providers', (_req, res) => {
  return res.json({ providers: Object.keys(oauthProviderConfig).filter(providerConfigured) });
});

authRoutes.get('/oauth/:provider', (req, res) => {
  const provider = req.params.provider;
  const config = oauthProviderConfig[provider];
  if (!config || !providerConfigured(provider)) {
    return res.status(503).json({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'This sign-in provider is not configured on this deployment.' } });
  }
  const state = randomBytes(32).toString('base64url');
  oauthCookie(res, state);
  const target = new URL(config.authorizationEndpoint);
  target.searchParams.set('client_id', config.clientId());
  target.searchParams.set('redirect_uri', config.redirectUri());
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', config.scopes);
  target.searchParams.set('state', state);
  if (provider === 'google') target.searchParams.set('prompt', 'select_account');
  return res.redirect(302, target.toString());
});

authRoutes.get('/oauth/:provider/callback', authWriteLimit, requireAuthConfiguration, async (req, res, next) => {
  const provider = req.params.provider;
  const config = oauthProviderConfig[provider];
  if (!config || !providerConfigured(provider)) return res.redirect(302, oauthErrorRedirect(req, 'provider_not_configured'));
  const expectedState = readOauthCookie(req);
  oauthCookie(res, '', 0);
  const receivedState = typeof req.query.state === 'string' ? req.query.state : '';
  if (!expectedState || !receivedState || expectedState.length !== receivedState.length ||
      !timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState))) {
    return res.redirect(302, oauthErrorRedirect(req, 'state_invalid'));
  }
  if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') {
    return res.redirect(302, oauthErrorRedirect(req, 'provider_cancelled'));
  }

  try {
    let accessToken;
    if (provider === 'google') {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code, client_id: config.clientId(), client_secret: config.clientSecret(),
          redirect_uri: config.redirectUri(), grant_type: 'authorization_code'
        })
      });
      const body = await response.json();
      if (!response.ok || typeof body.access_token !== 'string') return res.redirect(302, oauthErrorRedirect(req, 'token_exchange_failed'));
      accessToken = body.access_token;
    } else {
      const tokenUrl = new URL(config.tokenEndpoint);
      tokenUrl.searchParams.set('client_id', config.clientId());
      tokenUrl.searchParams.set('client_secret', config.clientSecret());
      tokenUrl.searchParams.set('redirect_uri', config.redirectUri());
      tokenUrl.searchParams.set('code', req.query.code);
      const response = await fetch(tokenUrl);
      const body = await response.json();
      if (!response.ok || typeof body.access_token !== 'string') return res.redirect(302, oauthErrorRedirect(req, 'token_exchange_failed'));
      accessToken = body.access_token;
    }

    const profileUrl = provider === 'google'
      ? 'https://openidconnect.googleapis.com/v1/userinfo'
      : 'https://graph.facebook.com/me?fields=id,name,email';
    const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || typeof profile.sub === 'string' && !profile.sub || typeof profile.id !== 'string' && typeof profile.sub !== 'string') {
      return res.redirect(302, oauthErrorRedirect(req, 'profile_unavailable'));
    }
    const subject = String(profile.sub ?? profile.id);
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    const displayName = String(profile.name ?? profile.given_name ?? email.split('@')[0] ?? 'Mageus member').trim().slice(0, 100) || 'Mageus member';
    if (!email) return res.redirect(302, oauthErrorRedirect(req, 'email_required'));

    const client = await pool.connect();
    let user;
    let refreshToken;
    try {
      await client.query('BEGIN');
      const existingIdentity = await client.query(
        `SELECT u.id, u.email, u.username, u.display_name
           FROM user_external_identities i JOIN users u ON u.id = i.user_id
          WHERE i.provider = $1 AND i.provider_subject = $2 FOR UPDATE OF u`,
        [provider, subject]
      );
      if (existingIdentity.rowCount) {
        user = existingIdentity.rows[0];
        await client.query('UPDATE user_external_identities SET last_used_at = now() WHERE provider = $1 AND provider_subject = $2', [provider, subject]);
      } else {
        const existingEmail = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
        if (existingEmail.rowCount) {
          await client.query('ROLLBACK');
          return res.redirect(302, oauthErrorRedirect(req, 'account_link_required'));
        }
        const baseUsername = (email.split('@')[0] || 'mageus-user').toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 30);
        let username = baseUsername.length >= 2 ? baseUsername : 'member';
        for (let suffix = 0; ; suffix++) {
          const candidate = suffix === 0 ? username : `${username.slice(0, 30 - String(suffix).length - 1)}-${suffix}`;
          const taken = await client.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
          if (!taken.rowCount) { username = candidate; break; }
        }
        const created = await client.query(
          `INSERT INTO users (email, username, display_name, password_hash)
           VALUES ($1, $2, $3, NULL)
           RETURNING id, email, username, display_name`,
          [email, username, displayName]
        );
        user = created.rows[0];
        await client.query('INSERT INTO channels (owner_user_id, username, display_name) VALUES ($1, $2, $3)', [user.id, user.username, user.display_name]);
        await client.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
        await client.query(
          `INSERT INTO user_external_identities (user_id, provider, provider_subject, provider_email, email_verified)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, provider, subject, email, provider === 'google' ? profile.email_verified === true : false]
        );
      }
      refreshToken = createRefreshToken();
      await client.query(
        'INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashRefreshToken(refreshToken), refreshExpiry()]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') return res.redirect(302, oauthErrorRedirect(req, 'account_creation_conflict'));
      throw error;
    } finally { client.release(); }

    setRefreshCookie(res, refreshToken);
    const origin = req.app.locals.allowedOrigins?.[0] || 'http://localhost:4200';
    return res.redirect(302, new URL('/feed', origin).toString());
  } catch (error) { next(error); }
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
