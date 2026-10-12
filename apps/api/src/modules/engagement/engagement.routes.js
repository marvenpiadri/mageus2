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

// Like totals are public; the viewer's own state is only available to an authenticated account.
engagementRoutes.get('/articles/:articleId/likes', async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `SELECT count(l.user_id)::int AS count
         FROM article_likes l
         JOIN articles a ON a.id = l.article_id
        WHERE l.article_id = $1 AND a.status = 'published'`,
      [id.data]
    );
    const article = await pool.query("SELECT 1 FROM articles WHERE id = $1 AND status = 'published'", [id.data]);
    if (!article.rowCount) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    return res.json({ likeCount: rows[0].count });
  } catch (error) { next(error); }
});

engagementRoutes.get('/articles/:articleId/likes/mine', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM article_likes l
         JOIN articles a ON a.id = l.article_id
         WHERE l.article_id = $1 AND l.user_id = $2 AND a.status = 'published'
       ) AS liked`,
      [id.data, req.auth.userId]
    );
    return res.json({ liked: rows[0].liked });
  } catch (error) { next(error); }
});

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
    } else {
      const owner = await pool.query(
        `SELECT c.owner_user_id FROM articles a JOIN channels c ON c.id = a.channel_id WHERE a.id = $1`,
        [id.data]
      );
      if (owner.rows[0]?.owner_user_id && owner.rows[0].owner_user_id !== req.auth.userId) {
        await pool.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
           VALUES ($1, $2, 'like', 'article', $3)`,
          [owner.rows[0].owner_user_id, req.auth.userId, id.data]
        );
      }
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
    const owner = await pool.query(
      `SELECT c.owner_user_id FROM articles a JOIN channels c ON c.id = a.channel_id WHERE a.id = $1`,
      [id.data]
    );
    if (owner.rows[0]?.owner_user_id && owner.rows[0].owner_user_id !== req.auth.userId) {
      await pool.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
         VALUES ($1, $2, 'comment', 'article', $3)`,
        [owner.rows[0].owner_user_id, req.auth.userId, id.data]
      );
    }
    return res.status(201).json({ comment: rows[0] });
  } catch (error) { next(error); }
});


// Article ratings are a 0–100 scale, distinct from a binary like.
// Reading the aggregate is public; casting or changing a vote requires identity.
engagementRoutes.get('/articles/:articleId/votes', async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const article = await pool.query("SELECT 1 FROM articles WHERE id = $1 AND status = 'published'", [id.data]);
    if (!article.rowCount) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    const { rows } = await pool.query(
      `SELECT COALESCE(round(avg(v.value)::numeric, 1), 0)::numeric AS average,
              count(v.value)::int AS count
         FROM article_votes v
        WHERE v.article_id = $1`,
      [id.data]
    );
    return res.json({ average: Number(rows[0].average), count: rows[0].count });
  } catch (error) { next(error); }
});

engagementRoutes.get('/articles/:articleId/votes/mine', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `SELECT v.value
         FROM article_votes v
         JOIN articles a ON a.id = v.article_id
        WHERE v.article_id = $1 AND v.user_id = $2 AND a.status = 'published'`,
      [id.data, req.auth.userId]
    );
    return res.json({ userVote: rows[0]?.value ?? null });
  } catch (error) { next(error); }
});

engagementRoutes.put('/articles/:articleId/votes', engagementWriteLimit, requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  const vote = z.object({ value: z.number().int().min(0).max(100) }).safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!vote.success) return res.status(400).json({ error: { code: 'INVALID_VOTE', message: 'Vote value must be an integer from 0 to 100.' } });
  try {
    const { rows } = await pool.query(
      `INSERT INTO article_votes (article_id, user_id, value)
       SELECT a.id, $2, $3 FROM articles a
        WHERE a.id = $1 AND a.status = 'published'
       ON CONFLICT (article_id, user_id)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING value, (xmax = 0) AS created`,
      [id.data, req.auth.userId, vote.data.value]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    if (rows[0].created) {
      const owner = await pool.query(
        `SELECT c.owner_user_id FROM articles a JOIN channels c ON c.id = a.channel_id WHERE a.id = $1`,
        [id.data]
      );
      if (owner.rows[0]?.owner_user_id && owner.rows[0].owner_user_id !== req.auth.userId) {
        await pool.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
           VALUES ($1, $2, 'vote', 'article', $3)`,
          [owner.rows[0].owner_user_id, req.auth.userId, id.data]
        );
      }
    }
    const { rows: summary } = await pool.query(
      `SELECT round(avg(value)::numeric, 1)::numeric AS average, count(*)::int AS count
         FROM article_votes WHERE article_id = $1`,
      [id.data]
    );
    return res.json({ userVote: rows[0].value, average: Number(summary[0].average), count: summary[0].count });
  } catch (error) { next(error); }
});
