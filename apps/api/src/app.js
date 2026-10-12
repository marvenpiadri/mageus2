import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { pool, requireDatabase } from './db/pool.js';
import { articleRoutes } from './modules/articles/article.routes.js';
import { articleAuthoringRoutes } from './modules/articles/article-authoring.routes.js';
import { engagementRoutes } from './modules/engagement/engagement.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { socialRoutes } from './modules/social/social.routes.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.locals.allowedOrigins = env.corsOrigins;
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 600
}));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'mageus-api' }));
app.get('/ready', async (_req, res) => {
  if (!pool) return res.status(503).json({ status: 'not-ready', reason: 'database-not-configured' });
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ready', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'not-ready', reason: 'database-unavailable' });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/articles', articleAuthoringRoutes);
app.use('/api/v1/articles', articleRoutes);
app.use('/api/v1/engagement', engagementRoutes);
app.use('/api/v1/social', socialRoutes);

app.use((req, res) => res.status(404).json({
  error: { code: 'NOT_FOUND', message: 'Endpoint not found.' }
}));
app.use((error, _req, res, _next) => {
  if (error?.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } });
  }
  console.error('Unhandled API error:', error?.message ?? 'unknown error');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
});
