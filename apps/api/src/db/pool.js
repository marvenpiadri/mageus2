import { Pool } from '@neondatabase/serverless';
import { env } from '../config/env.js';

export const pool = env.DATABASE_URL
  ? new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000
    })
  : null;

export function requireDatabase(_req, res, next) {
  if (!pool) {
    return res.status(503).json({
      error: { code: 'DATABASE_NOT_CONFIGURED', message: 'The API database is not configured yet.' }
    });
  }
  next();
}
