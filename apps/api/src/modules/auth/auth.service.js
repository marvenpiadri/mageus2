import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;
const COOKIE_NAME = 'mageus_refresh';

function signingKey() {
  if (!env.AUTH_JWT_SECRET || env.AUTH_JWT_SECRET.length < 32) {
    const error = new Error('JWT signing secret is not configured.');
    error.name = 'AuthNotConfiguredError';
    throw error;
  }
  return new TextEncoder().encode(env.AUTH_JWT_SECRET);
}

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  try { return await argon2.verify(hash, password); } catch { return false; }
}

export async function issueAccessToken(user) {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(env.AUTH_ISSUER || 'mageus-api')
    .setAudience(env.AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(signingKey());
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer: env.AUTH_ISSUER || 'mageus-api',
    audience: env.AUTH_AUDIENCE,
    algorithms: ['HS256']
  });
  if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
    throw new Error('Invalid access token claims.');
  }
  return { userId: payload.sub, username: payload.username };
}

export function createRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function setRefreshCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/api/v1/auth',
    'SameSite=Lax',
    `Max-Age=${REFRESH_TTL_DAYS * 24 * 60 * 60}`
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearRefreshCookie(res) {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/api/v1/auth', 'SameSite=Lax', 'Max-Age=0'];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function readRefreshCookie(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) || null; }
  catch { return null; }
}

export function requireAuthConfiguration(_req, res, next) {
  if (!env.AUTH_JWT_SECRET || env.AUTH_JWT_SECRET.length < 32) {
    return res.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured on this deployment.' } });
  }
  next();
}

export async function requireVerifiedIdentity(req, res, next) {
  const authorization = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to perform this action.' } });
  }
  try {
    req.auth = await verifyAccessToken(match[1]);
    return next();
  } catch (error) {
    if (error?.name === 'AuthNotConfiguredError') {
      return res.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured on this deployment.' } });
    }
    return res.status(401).json({ error: { code: 'INVALID_ACCESS_TOKEN', message: 'Your session has expired. Sign in again.' } });
  }
}
