import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity } from '../auth/auth.service.js';
import { findPublishedArticle, listPublishedArticles } from './article.repository.js';

export const articleRoutes = Router();
const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const blockTypes = ['text', 'image', 'gallery', 'slide', 'quote', 'embed', 'before_after', 'hotspot', 'timeline', 'steps', 'data_viz', 'math', 'product', 'product_collection', 'magazine_ref'];
const blockSchema = z.object({
  id: z.string().trim().min(1).max(128),
  type: z.enum(blockTypes),
  version: z.number().int().positive().max(100)
}).passthrough();

const writeSchema = z.object({
  channelId: z.string().uuid().optional(),
  expectedRevision: z.number().int().positive().optional(),
  title: z.string().trim().max(240).optional(),
  subtitle: z.string().trim().max(500).optional(),
  slug: z.string().trim().max(180).regex(slugPattern).optional(),
  excerpt: z.string().trim().max(600).optional(),
  category: z.string().trim().max(80).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  coverImageUrl: z.string().trim().max(2048).optional().nullable(),
  blocks: z.array(blockSchema).max(250).optional(),
  schemaVersion: z.number().int().positive().max(100).optional(),
  seoTitle: z.string().trim().max(240).optional(),
  seoDescription: z.string().trim().max(600).optional(),
  canonicalUrl: z.string().trim().max(2048).optional().nullable()
}).strict();

const articleColumns = `
  id, channel_id, slug, title, subtitle, excerpt, category, language, tags,
  cover_image_url, blocks, schema_version, status, seo_title, seo_description,
  canonical_url, published_at, created_at, updated_at, revision
`;

function slugify(value) {
  return value.normalize('NFKD').toLowerCase()
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180)
    .replace(/-+$/g, '');
}

function toPublicWriteValues(data, existing = {}) {
  const title = data.title ?? existing.title ?? '';
  const slug = data.slug ?? existing.slug ?? slugify(title) ?? '';
  const blocks = data.blocks ?? existing.blocks ?? [];
  return {
    title,
    slug,
    subtitle: data.subtitle ?? existing.subtitle ?? '',
    excerpt: data.excerpt ?? existing.excerpt ?? '',
    category: data.category ?? existing.category ?? '',
    language: data.language ?? existing.language ?? 'en',
    tags: data.tags ?? existing.tags ?? [],
    coverImageUrl: data.coverImageUrl !== undefined ? data.coverImageUrl : (existing.cover_image_url ?? null),
    blocks,
    schemaVersion: data.schemaVersion ?? existing.schema_version ?? 1,
    seoTitle: data.seoTitle !== undefined ? data.seoTitle : (existing.seo_title ?? null),
    seoDescription: data.seoDescription !== undefined ? data.seoDescription : (existing.seo_description ?? null),
    canonicalUrl: data.canonicalUrl !== undefined ? data.canonicalUrl : (existing.canonical_url ?? null)
  };
}

function validateForPublish(values) {
  const issues = [];
  if (!values.title.trim()) issues.push('Add an article title.');
  if (!slugPattern.test(values.slug)) issues.push('The public URL slug is invalid.');
  if (!values.blocks.length) issues.push('Add at least one content block.');
  for (const [index, block] of values.blocks.entries()) {
    const label = `Block ${index + 1}`;
    if (block.type === 'image') {
      if (typeof block.imageUrl !== 'string' || !block.imageUrl.trim()) issues.push(`${label}: choose an image.`);
      if (typeof block.alt !== 'string' || !block.alt.trim()) issues.push(`${label}: add image alternative text.`);
    }
    if (block.type === 'embed') {
      try {
        const url = new URL(block.url);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      } catch { issues.push(`${label}: enter a valid HTTP(S) embed URL.`); }
    }
    if (block.type === 'product' && (typeof block.productId !== 'string' || !block.productId.trim())) issues.push(`${label}: select a product reference.`);
    if (block.type === 'magazine_ref' && (typeof block.magazineId !== 'string' || !block.magazineId.trim())) issues.push(`${label}: select a magazine reference.`);
  }
  return issues;
}

function articleDto(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: row.excerpt,
    category: row.category,
    language: row.language,
    tags: row.tags,
    coverImageUrl: row.cover_image_url,
    blocks: row.blocks,
    schemaVersion: row.schema_version,
    status: row.status,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    canonicalUrl: row.canonical_url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision
  };
}

async function writeRevision(client, row, userId) {
  await client.query(
    `INSERT INTO article_revisions (article_id, revision, snapshot, edited_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (article_id, revision) DO NOTHING`,
    [row.id, row.revision, JSON.stringify(row), userId]
  );
}

// Public reads are intentionally unauthenticated. Drafts and all write operations
// are kept behind the verified identity and channel-ownership checks.
articleRoutes.get('/', requireDatabase, async (req, res, next) => {
  try {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional()
    }).safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid pagination parameters.' } });
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.json(await listPublishedArticles(query.data));
  } catch (error) {
    if (error?.name === 'InvalidCursorError') return res.status(400).json({ error: { code: 'INVALID_CURSOR', message: 'Invalid pagination cursor.' } });
    next(error);
  }
});

articleRoutes.post('/', requireDatabase, requireVerifiedIdentity, async (req, res, next) => {
  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Some article fields are invalid.' } });
  try {
    const channel = await pool.query(
      `SELECT id FROM channels
        WHERE owner_user_id = $1 AND ($2::uuid IS NULL OR id = $2)
        ORDER BY created_at ASC LIMIT 1`,
      [req.auth.userId, parsed.data.channelId ?? null]
    );
    if (!channel.rows[0]) return res.status(404).json({ error: { code: 'CHANNEL_NOT_FOUND', message: 'No channel owned by this account was found.' } });
    const values = toPublicWriteValues(parsed.data);
    values.slug = values.slug || slugify(values.title) || `untitled-${randomUUID().slice(0, 8)}`;
    const { rows } = await pool.query(
      `INSERT INTO articles
        (channel_id, slug, title, subtitle, excerpt, category, language, tags, cover_image_url,
         blocks, schema_version, status, seo_title, seo_description, canonical_url, revision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'draft',$12,$13,$14,1)
       RETURNING ${articleColumns}`,
      [channel.rows[0].id, values.slug, values.title || 'Untitled article', values.subtitle,
       values.excerpt, values.category, values.language, values.tags, values.coverImageUrl,
       JSON.stringify(values.blocks), values.schemaVersion, values.seoTitle, values.seoDescription, values.canonicalUrl]
    );
    return res.status(201).json({ article: articleDto(rows[0]) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'ARTICLE_SLUG_CONFLICT', message: 'That slug is already published on this channel.' } });
    next(error);
  }
});

articleRoutes.get('/drafts', requireDatabase, requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*
         FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE c.owner_user_id = $1 AND a.status = 'draft'
        ORDER BY a.updated_at DESC LIMIT 100`,
      [req.auth.userId]
    );
    return res.json({ articles: rows.map(articleDto) });
  } catch (error) { next(error); }
});

articleRoutes.put('/:articleId', requireDatabase, requireVerifiedIdentity, async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.articleId);
  const parsed = writeSchema.extend({ expectedRevision: z.number().int().positive() }).safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Include a valid expectedRevision and article fields.' } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT a.* FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF a`,
      [id.data, req.auth.userId]
    );
    const existing = selected.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    if (existing.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'ARTICLE_NOT_DRAFT', message: 'Create an editable draft version before changing a published article.' } });
    }
    if (existing.revision !== parsed.data.expectedRevision) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'REVISION_CONFLICT', message: 'This draft changed elsewhere. Reload before saving.' }, currentRevision: existing.revision });
    }
    await writeRevision(client, existing, req.auth.userId);
    const values = toPublicWriteValues(parsed.data, existing);
    const { rows } = await client.query(
      `UPDATE articles SET slug=$2, title=$3, subtitle=$4, excerpt=$5, category=$6, language=$7,
          tags=$8, cover_image_url=$9, blocks=$10::jsonb, schema_version=$11, seo_title=$12,
          seo_description=$13, canonical_url=$14, revision=revision+1, updated_at=now()
        WHERE id=$1 RETURNING ${articleColumns}`,
      [existing.id, values.slug, values.title, values.subtitle, values.excerpt, values.category,
       values.language, values.tags, values.coverImageUrl, JSON.stringify(values.blocks),
       values.schemaVersion, values.seoTitle, values.seoDescription, values.canonicalUrl]
    );
    await client.query('COMMIT');
    return res.json({ article: articleDto(rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'ARTICLE_SLUG_CONFLICT', message: 'That slug is already published on this channel.' } });
    next(error);
  } finally { client.release(); }
});

articleRoutes.post('/:articleId/fork', requireDatabase, requireVerifiedIdentity, async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const source = await pool.query(
      `SELECT a.* FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 AND a.status = 'published' LIMIT 1`,
      [id.data, req.auth.userId]
    );
    if (!source.rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Published article not found.' } });
    const a = source.rows[0];
    const { rows } = await pool.query(
      `INSERT INTO articles
        (channel_id, slug, title, subtitle, excerpt, category, language, tags, cover_image_url,
         blocks, schema_version, status, seo_title, seo_description, canonical_url, revision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'draft',$12,$13,$14,1)
       RETURNING ${articleColumns}`,
      [a.channel_id,a.slug,a.title,a.subtitle,a.excerpt,a.category,a.language,a.tags,a.cover_image_url,
       JSON.stringify(a.blocks),a.schema_version,a.seo_title,a.seo_description,a.canonical_url]
    );
    return res.status(201).json({ article: articleDto(rows[0]) });
  } catch (error) { next(error); }
});

articleRoutes.post('/:articleId/publish', requireDatabase, requireVerifiedIdentity, async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.articleId);
  const expected = z.object({ expectedRevision: z.number().int().positive() }).safeParse(req.body ?? {});
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!expected.success) return res.status(400).json({ error: { code: 'INVALID_REVISION', message: 'Include the current expectedRevision.' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT a.* FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF a`,
      [id.data, req.auth.userId]
    );
    const draft = selected.rows[0];
    if (!draft || draft.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'DRAFT_NOT_FOUND', message: 'Editable draft not found.' } });
    }
    if (draft.revision !== expected.data.expectedRevision) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'REVISION_CONFLICT', message: 'This draft changed elsewhere. Reload before publishing.' }, currentRevision: draft.revision });
    }
    const values = toPublicWriteValues({}, draft);
    const issues = validateForPublish(values);
    if (issues.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: { code: 'ARTICLE_NOT_READY', message: 'Fix these issues before publishing.', issues } });
    }
    await writeRevision(client, draft, req.auth.userId);
    const collision = await client.query(
      `SELECT a.* FROM articles a
        WHERE a.channel_id=$1 AND a.slug=$2 AND a.status='published'
        FOR UPDATE`,
      [draft.channel_id, draft.slug]
    );
    let published;
    if (collision.rows[0]) {
      const live = collision.rows[0];
      await writeRevision(client, live, req.auth.userId);
      const updated = await client.query(
        `UPDATE articles SET title=$2, subtitle=$3, excerpt=$4, category=$5, language=$6, tags=$7,
            cover_image_url=$8, blocks=$9::jsonb, schema_version=$10, seo_title=$11,
            seo_description=$12, canonical_url=$13, revision=revision+1, updated_at=now(), published_at=now()
          WHERE id=$1 RETURNING ${articleColumns}`,
        [live.id,values.title,values.subtitle,values.excerpt,values.category,values.language,values.tags,
         values.coverImageUrl,JSON.stringify(values.blocks),values.schemaVersion,values.seoTitle,values.seoDescription,values.canonicalUrl]
      );
      published = updated.rows[0];
      await client.query('DELETE FROM articles WHERE id=$1', [draft.id]);
    } else {
      const updated = await client.query(
        `UPDATE articles SET status='published', published_at=now(), revision=revision+1, updated_at=now()
          WHERE id=$1 RETURNING ${articleColumns}`,
        [draft.id]
      );
      published = updated.rows[0];
    }
    await client.query('COMMIT');
    return res.json({ article: articleDto(published) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

articleRoutes.get('/:username/:slug', requireDatabase, async (req, res, next) => {
  try {
    const username = req.params.username.toLowerCase();
    const slug = req.params.slug.toLowerCase();
    if (!usernamePattern.test(username) || !slugPattern.test(slug)) {
      return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    const article = await findPublishedArticle(username, slug);
    if (!article) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    res.set('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=1800');
    res.set('X-Robots-Tag', 'index, follow');
    res.json({ article });
  } catch (error) { next(error); }
});
