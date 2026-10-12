import { Pool, neonConfig } from '@neondatabase/serverless';
import { env } from '../config/env.js';

if (env.DATABASE_URL) {
  // Neon uses WebSockets for the serverless driver in Node runtimes.
  neonConfig.poolQueryViaFetch = true;
}

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
