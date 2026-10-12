import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  AUTH_ISSUER: z.string().optional(),
  AUTH_AUDIENCE: z.string().default('mageus')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid API environment configuration:', parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })));
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
});
