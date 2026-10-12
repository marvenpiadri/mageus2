import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity } from '../auth/auth.service.js';

export const engagementRoutes = Router();
engagementRoutes.use(requireDatabase);
const engagementWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many engagement actions. Try again later.' } }
});

const uuid = z.string().uuid();

engagementRoutes.post('/articles/:articleId/likes', engagementWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const result = await pool.query(
      `INSERT INTO article_likes (article_id, user_id)
       SELECT a.id, $2 FROM articles a
        WHERE a.id = $1 AND a.status = 'published'
       ON CONFLICT (article_id, user_id) DO NOTHING
       RETURNING article_id`,
      [id.data, req.auth.userId]
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT 1 FROM articles WHERE id = $1 AND status = 'published'", [id.data]);
      if (!exists.rowCount) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    const count = await pool.query('SELECT count(*)::int AS count FROM article_likes WHERE article_id = $1', [id.data]);
    return res.json({ liked: true, likeCount: count.rows[0].count });
  } catch (error) { next(error); }
});

engagementRoutes.delete('/articles/:articleId/likes', engagementWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const article = await pool.query("SELECT 1 FROM articles WHERE id = $1 AND status = 'published'", [id.data]);
    if (!article.rowCount) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    await pool.query('DELETE FROM article_likes WHERE article_id = $1 AND user_id = $2', [id.data, req.auth.userId]);
    const count = await pool.query('SELECT count(*)::int AS count FROM article_likes WHERE article_id = $1', [id.data]);
    return res.json({ liked: false, likeCount: count.rows[0].count });
  } catch (error) { next(error); }
});

// Public reading stays open; only creating/moderating a comment requires identity.
engagementRoutes.get('/articles/:articleId/comments', async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.parent_comment_id, c.body, c.created_at,
              u.username AS author_username, u.display_name AS author_name
         FROM article_comments c
         JOIN users u ON u.id = c.author_user_id
         JOIN articles a ON a.id = c.article_id
        WHERE c.article_id = $1 AND c.status = 'visible' AND a.status = 'published'
        ORDER BY c.created_at ASC
        LIMIT 100`,
      [id.data]
    );
    return res.json({ comments: rows });
  } catch (error) { next(error); }
});

engagementRoutes.post('/articles/:articleId/comments', engagementWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  const body = z.object({
    body: z.string().trim().min(1).max(10000),
    parentCommentId: z.string().uuid().optional()
  }).safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!body.success) return res.status(400).json({ error: { code: 'INVALID_COMMENT', message: 'A comment must contain between 1 and 10,000 characters.' } });
  try {
    const { rows } = await pool.query(
      `INSERT INTO article_comments (article_id, author_user_id, parent_comment_id, body)
       SELECT a.id, $2, $3, $4
         FROM articles a
        WHERE a.id = $1 AND a.status = 'published'
          AND ($3::uuid IS NULL OR EXISTS (
            SELECT 1 FROM article_comments parent
             WHERE parent.id = $3 AND parent.article_id = a.id AND parent.status = 'visible'
          ))
       RETURNING id, parent_comment_id, body, created_at`,
      [id.data, req.auth.userId, body.data.parentCommentId ?? null, body.data.body]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_OR_PARENT_NOT_FOUND', message: 'Article or parent comment not found.' } });
    return res.status(201).json({ comment: rows[0] });
  } catch (error) { next(error); }
});
