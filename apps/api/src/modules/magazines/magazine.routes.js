import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity } from '../auth/auth.service.js';

export const magazineRoutes = Router();
magazineRoutes.use(requireDatabase);

const slug = z.string().min(2).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const uuid = z.string().uuid();
const writeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const magazineDto = (row) => ({
  id: row.id, slug: row.slug, title: row.title, description: row.description,
  cover_image_url: row.cover_image_url, status: row.status,
  published_at: row.published_at, created_at: row.created_at,
  author_username: row.author_username, author_name: row.author_name,
  issue_count: Number(row.issue_count ?? 0)
});

magazineRoutes.get('/', async (req, res, next) => {
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(30).default(12),
    cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional()
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid magazine pagination parameters.' } });
  try {
    const values = [parsed.data.limit + 1];
    let cursorClause = '';
    if (parsed.data.cursor) {
      let decoded;
      try { decoded = JSON.parse(Buffer.from(parsed.data.cursor, 'base64url').toString('utf8')); } catch { decoded = null; }
      if (!decoded || typeof decoded.publishedAt !== 'string' || !Number.isFinite(Date.parse(decoded.publishedAt)) || !uuid.safeParse(decoded.id).success) {
        return res.status(400).json({ error: { code: 'INVALID_CURSOR', message: 'Invalid magazine cursor.' } });
      }
      values.push(decoded.publishedAt, decoded.id);
      cursorClause = 'AND (m.published_at, m.id) < ($2::timestamptz, $3::uuid)';
    }
    const result = await pool.query(
      `SELECT m.*, c.username AS author_username, c.display_name AS author_name,
              (SELECT count(*)::int FROM magazine_issues i WHERE i.magazine_id = m.id AND i.status = 'published') AS issue_count
         FROM magazines m JOIN channels c ON c.id = m.channel_id
        WHERE m.status = 'published' AND m.published_at IS NOT NULL
          ${cursorClause}
        ORDER BY m.published_at DESC, m.id DESC LIMIT $1`,
      values
    );
    const hasMore = result.rows.length > parsed.data.limit;
    const items = result.rows.slice(0, parsed.data.limit).map(magazineDto);
    const last = result.rows[parsed.data.limit - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ publishedAt: last.published_at, id: last.id })).toString('base64url')
      : null;
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.set('X-Robots-Tag', 'index, follow');
    return res.json({ items, nextCursor });
  } catch (error) { next(error); }
});

magazineRoutes.get('/mine', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, c.username AS author_username, c.display_name AS author_name,
              (SELECT count(*)::int FROM magazine_issues i WHERE i.magazine_id = m.id) AS issue_count
         FROM magazines m JOIN channels c ON c.id = m.channel_id
        WHERE c.owner_user_id = $1 ORDER BY m.updated_at DESC`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ items: rows.map(magazineDto) });
  } catch (error) { next(error); }
});

magazineRoutes.get('/mine/articles', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.slug, a.title, a.subtitle, a.excerpt, a.cover_image_url, a.published_at
         FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE c.owner_user_id = $1 AND a.status = 'published' AND a.published_at IS NOT NULL
        ORDER BY a.published_at DESC, a.id DESC LIMIT 200`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ items: rows });
  } catch (error) { next(error); }
});

magazineRoutes.post('/', requireVerifiedIdentity, writeLimit, async (req, res, next) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(160),
    slug,
    description: z.string().max(5000).default(''),
    coverImageUrl: z.string().url().max(2048).nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_MAGAZINE', message: 'Provide a title, URL slug, and valid magazine details.' } });
  try {
    const channel = await pool.query('SELECT id FROM channels WHERE owner_user_id = $1 LIMIT 1', [req.auth.userId]);
    if (!channel.rows[0]) return res.status(409).json({ error: { code: 'CHANNEL_REQUIRED', message: 'Create your Mageus channel before creating a magazine.' } });
    const { rows } = await pool.query(
      `INSERT INTO magazines (channel_id, slug, title, description, cover_image_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [channel.rows[0].id, parsed.data.slug, parsed.data.title, parsed.data.description, parsed.data.coverImageUrl ?? null]
    );
    return res.status(201).json({ magazine: rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'MAGAZINE_SLUG_EXISTS', message: 'You already have a magazine with that URL.' } });
    next(error);
  }
});

magazineRoutes.post('/:magazineId/issues', requireVerifiedIdentity, writeLimit, async (req, res, next) => {
  const id = uuid.safeParse(req.params.magazineId);
  const parsed = z.object({
    title: z.string().trim().min(1).max(160),
    slug,
    issueNumber: z.number().int().positive().max(100000),
    summary: z.string().max(5000).default(''),
    coverImageUrl: z.string().url().max(2048).nullable().optional()
  }).safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ISSUE', message: 'Provide a title, URL slug, and positive issue number.' } });
  try {
    const { rows } = await pool.query(
      `INSERT INTO magazine_issues (magazine_id, slug, title, issue_number, summary, cover_image_url)
       SELECT m.id, $3, $4, $5, $6, $7
         FROM magazines m JOIN channels c ON c.id = m.channel_id
        WHERE m.id = $1 AND c.owner_user_id = $2
       RETURNING *`,
      [id.data, req.auth.userId, parsed.data.slug, parsed.data.title, parsed.data.issueNumber, parsed.data.summary, parsed.data.coverImageUrl ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
    return res.status(201).json({ issue: rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'ISSUE_EXISTS', message: 'That issue URL or issue number is already used in this magazine.' } });
    next(error);
  }
});

magazineRoutes.put('/:magazineId/issues/:issueId/articles', requireVerifiedIdentity, writeLimit, async (req, res, next) => {
  const magazineId = uuid.safeParse(req.params.magazineId);
  const issueId = uuid.safeParse(req.params.issueId);
  const parsed = z.object({
    articles: z.array(z.object({
      articleId: uuid,
      sectionTitle: z.string().max(120).default('')
    })).max(100)
  }).safeParse(req.body);
  if (!magazineId.success || !issueId.success) return res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found.' } });
  if (!parsed.success || new Set((parsed.data?.articles ?? []).map((item) => item.articleId)).size !== (parsed.data?.articles ?? []).length) {
    return res.status(400).json({ error: { code: 'INVALID_ISSUE_ARTICLES', message: 'Choose up to 100 unique published articles.' } });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query(
      `SELECT i.id, m.channel_id FROM magazine_issues i
         JOIN magazines m ON m.id = i.magazine_id
         JOIN channels c ON c.id = m.channel_id
        WHERE m.id = $1 AND i.id = $2 AND c.owner_user_id = $3 FOR UPDATE OF i`,
      [magazineId.data, issueId.data, req.auth.userId]
    );
    if (!owned.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found.' } });
    }
    const articleIds = parsed.data.articles.map((item) => item.articleId);
    if (articleIds.length) {
      const valid = await client.query(
        `SELECT id FROM articles WHERE channel_id = $1 AND status = 'published' AND published_at IS NOT NULL AND id = ANY($2::uuid[])`,
        [owned.rows[0].channel_id, articleIds]
      );
      if (valid.rowCount !== articleIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'INVALID_ISSUE_ARTICLES', message: 'Every selected article must be published on your own channel.' } });
      }
    }
    await client.query('DELETE FROM magazine_issue_articles WHERE issue_id = $1', [issueId.data]);
    for (const [sortOrder, item] of parsed.data.articles.entries()) {
      await client.query(
        'INSERT INTO magazine_issue_articles (issue_id, article_id, sort_order, section_title) VALUES ($1,$2,$3,$4)',
        [issueId.data, item.articleId, sortOrder, item.sectionTitle]
      );
    }
    await client.query('UPDATE magazine_issues SET updated_at = now() WHERE id = $1', [issueId.data]);
    await client.query('COMMIT');
    return res.json({ saved: true, articleCount: articleIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

magazineRoutes.patch('/:magazineId/publish', requireVerifiedIdentity, writeLimit, async (req, res, next) => {
  const id = uuid.safeParse(req.params.magazineId);
  if (!id.success) return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
  try {
    const { rows } = await pool.query(
      `UPDATE magazines m SET status = 'published', published_at = COALESCE(m.published_at, now()), updated_at = now()
         FROM channels c WHERE m.channel_id = c.id AND m.id = $1 AND c.owner_user_id = $2
       RETURNING m.*`,
      [id.data, req.auth.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
    return res.json({ magazine: rows[0] });
  } catch (error) { next(error); }
});

magazineRoutes.patch('/:magazineId/issues/:issueId/publish', requireVerifiedIdentity, writeLimit, async (req, res, next) => {
  const magazineId = uuid.safeParse(req.params.magazineId);
  const issueId = uuid.safeParse(req.params.issueId);
  if (!magazineId.success || !issueId.success) return res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found.' } });
  try {
    const { rows } = await pool.query(
      `UPDATE magazine_issues i SET status = 'published', published_at = COALESCE(i.published_at, now()), updated_at = now()
         FROM magazines m JOIN channels c ON c.id = m.channel_id
        WHERE i.magazine_id = m.id AND m.id = $1 AND i.id = $2 AND m.status = 'published' AND c.owner_user_id = $3
          AND EXISTS (SELECT 1 FROM magazine_issue_articles ia WHERE ia.issue_id = i.id)
       RETURNING i.*`,
      [magazineId.data, issueId.data, req.auth.userId]
    );
    if (!rows[0]) return res.status(409).json({ error: { code: 'ISSUE_NOT_READY', message: 'Publish the magazine and add at least one published article before publishing this issue.' } });
    return res.json({ issue: rows[0] });
  } catch (error) { next(error); }
});

magazineRoutes.get('/:username/:magazineSlug/issues/:issueSlug', async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  const magazineSlug = slug.safeParse(req.params.magazineSlug);
  const issueSlug = slug.safeParse(req.params.issueSlug);
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(username) || !magazineSlug.success || !issueSlug.success) {
    return res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found.' } });
  }
  try {
    const issueResult = await pool.query(
      `SELECT i.*, m.id AS magazine_id, m.slug AS magazine_slug, m.title AS magazine_title,
              m.description AS magazine_description, m.cover_image_url AS magazine_cover_image_url,
              c.username AS author_username, c.display_name AS author_name
         FROM magazine_issues i JOIN magazines m ON m.id = i.magazine_id
         JOIN channels c ON c.id = m.channel_id
        WHERE c.username = $1 AND m.slug = $2 AND i.slug = $3
          AND m.status = 'published' AND i.status = 'published' AND m.published_at IS NOT NULL AND i.published_at IS NOT NULL
        LIMIT 1`,
      [username, magazineSlug.data, issueSlug.data]
    );
    if (!issueResult.rows[0]) return res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found.' } });
    const issue = issueResult.rows[0];
    const articles = await pool.query(
      `SELECT a.id, a.slug, a.title, a.subtitle, a.excerpt, a.category, a.cover_image_url,
              a.published_at, ia.sort_order, ia.section_title
         FROM magazine_issue_articles ia JOIN articles a ON a.id = ia.article_id
        WHERE ia.issue_id = $1 AND a.status = 'published' AND a.published_at IS NOT NULL
        ORDER BY ia.sort_order, ia.added_at`,
      [issue.id]
    );
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.set('X-Robots-Tag', 'index, follow');
    return res.json({ issue, articles: articles.rows });
  } catch (error) { next(error); }
});

magazineRoutes.get('/:username/:magazineSlug', async (req, res, next) => {
  const username = String(req.params.username ?? '').toLowerCase();
  const magazineSlug = slug.safeParse(req.params.magazineSlug);
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(username) || !magazineSlug.success) {
    return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
  }
  try {
    const magazineResult = await pool.query(
      `SELECT m.*, c.username AS author_username, c.display_name AS author_name
         FROM magazines m JOIN channels c ON c.id = m.channel_id
        WHERE c.username = $1 AND m.slug = $2 AND m.status = 'published' AND m.published_at IS NOT NULL
        LIMIT 1`,
      [username, magazineSlug.data]
    );
    if (!magazineResult.rows[0]) return res.status(404).json({ error: { code: 'MAGAZINE_NOT_FOUND', message: 'Magazine not found.' } });
    const magazine = magazineResult.rows[0];
    const issues = await pool.query(
      `SELECT i.id, i.slug, i.title, i.issue_number, i.summary, i.cover_image_url, i.published_at,
              (SELECT count(*)::int FROM magazine_issue_articles ia JOIN articles a ON a.id = ia.article_id
                WHERE ia.issue_id = i.id AND a.status = 'published' AND a.published_at IS NOT NULL) AS article_count
         FROM magazine_issues i
        WHERE i.magazine_id = $1 AND i.status = 'published' AND i.published_at IS NOT NULL
        ORDER BY i.issue_number DESC`,
      [magazine.id]
    );
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.set('X-Robots-Tag', 'index, follow');
    return res.json({ magazine, issues: issues.rows });
  } catch (error) { next(error); }
});
