import { Router } from 'express';
import { z } from 'zod';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity } from '../auth/auth.service.js';
import { articleBlocksSchema, articleDraftInputSchema, articleDraftPatchSchema } from './article.schemas.js';

export const articleAuthoringRoutes = Router();
articleAuthoringRoutes.use(requireDatabase);

const uuid = z.string().uuid();
const publicArticleFields = `
  a.id, a.slug, a.title, a.subtitle, a.excerpt, a.cover_image_url,
  a.blocks, a.schema_version, a.status, a.seo_title, a.seo_description,
  a.canonical_url, a.published_at, a.created_at, a.updated_at,
  c.username AS author_username, c.display_name AS author_name
`;

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
}

function publicationIssues(article) {
  const issues = [];
  if (!article.title?.trim()) issues.push('An article title is required.');
  if (!article.slug?.trim()) issues.push('A public URL slug is required.');
  if (!Array.isArray(article.blocks) || article.blocks.length === 0) issues.push('Add at least one content block.');
  const blocks = articleBlocksSchema.safeParse(article.blocks);
  if (!blocks.success) issues.push('One or more blocks have invalid data. Save the draft and review the affected blocks.');
  if (blocks.success) {
    for (const [index, block] of blocks.data.entries()) {
      if (block.type === 'image' && (!block.imageUrl || !block.alt.trim())) issues.push(`Image block ${index + 1} needs an image URL and alternative text.`);
      if (block.type === 'gallery' && block.images.some((image) => !image.url || !image.alt.trim())) issues.push(`Gallery block ${index + 1} needs image URLs and alternative text for every image.`);
      if (block.type === 'embed' && !block.url) issues.push(`Embed block ${index + 1} needs a valid URL.`);
      if (block.type === 'before_after' && (!block.beforeImage || !block.afterImage)) issues.push(`Before/after block ${index + 1} needs both images.`);
      if (block.type === 'product' && !block.productId.trim()) issues.push(`Product block ${index + 1} needs a product reference.`);
      if (block.type === 'product_collection' && !block.productIds.length) issues.push(`Product collection block ${index + 1} needs at least one product reference.`);
      if (block.type === 'magazine_ref' && !block.magazineId.trim()) issues.push(`Magazine block ${index + 1} needs a magazine reference.`);
    }
  }
  return issues;
}

articleAuthoringRoutes.get('/mine', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${publicArticleFields}
         FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE c.owner_user_id = $1
        ORDER BY a.updated_at DESC
        LIMIT 200`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ articles: rows });
  } catch (error) { next(error); }
});

articleAuthoringRoutes.post('/', requireVerifiedIdentity, async (req, res, next) => {
  const parsed = articleDraftInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Article metadata or blocks are invalid.' } });
  const data = parsed.data;
  const slug = data.slug || slugify(data.title) || `story-${Date.now()}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO articles (
         channel_id, slug, title, subtitle, excerpt, cover_image_url, blocks,
         schema_version, status, seo_title, seo_description, canonical_url
       )
       SELECT c.id, $2, $3, $4, $5, NULLIF($6, ''), $7::jsonb, $8, 'draft', $9, $10, $11
         FROM channels c WHERE c.owner_user_id = $1
       RETURNING id, slug, title, subtitle, excerpt, cover_image_url, blocks,
                 schema_version, status, seo_title, seo_description, canonical_url,
                 published_at, created_at, updated_at`,
      [req.auth.userId, slug, data.title, data.subtitle, data.excerpt, data.coverImageUrl,
       JSON.stringify(data.blocks), data.schemaVersion, data.seoTitle ?? null,
       data.seoDescription ?? null, data.canonicalUrl ?? null]
    );
    if (!rows[0]) return res.status(409).json({ error: { code: 'CHANNEL_REQUIRED', message: 'Create a channel before writing an article.' } });
    return res.status(201).json({ article: rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'SLUG_EXISTS', message: 'This article URL is already in use on your channel.' } });
    next(error);
  }
});

articleAuthoringRoutes.patch('/:articleId', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  const parsed = articleDraftPatchSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Provide valid article fields to update.' } });

  const columns = {
    title: 'title', subtitle: 'subtitle', slug: 'slug', excerpt: 'excerpt',
    coverImageUrl: 'cover_image_url', blocks: 'blocks', schemaVersion: 'schema_version',
    seoTitle: 'seo_title', seoDescription: 'seo_description', canonicalUrl: 'canonical_url'
  };
  const values = [id.data, req.auth.userId];
  const sets = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.hasOwn(parsed.data, key)) continue;
    const value = key === 'blocks' ? JSON.stringify(parsed.data[key]) : key === 'coverImageUrl' ? (parsed.data[key] || null) : parsed.data[key];
    values.push(value);
    sets.push(`a.${column} = $${values.length}${key === 'blocks' ? '::jsonb' : ''}`);
  }
  sets.push('a.updated_at = now()');
  try {
    const { rows } = await pool.query(
      `UPDATE articles a SET ${sets.join(', ')}
         FROM channels c
        WHERE a.id = $1 AND c.id = a.channel_id AND c.owner_user_id = $2
       RETURNING a.id, a.slug, a.title, a.subtitle, a.excerpt, a.cover_image_url,
                 a.blocks, a.schema_version, a.status, a.seo_title, a.seo_description,
                 a.canonical_url, a.published_at, a.created_at, a.updated_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    return res.json({ article: rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'SLUG_EXISTS', message: 'This article URL is already in use on your channel.' } });
    next(error);
  }
});

articleAuthoringRoutes.post('/:articleId/publish', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const owned = await pool.query(
      `SELECT a.id, a.title, a.slug, a.blocks
         FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 LIMIT 1`,
      [id.data, req.auth.userId]
    );
    if (!owned.rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    const issues = publicationIssues(owned.rows[0]);
    if (issues.length) return res.status(422).json({ error: { code: 'PUBLISH_VALIDATION_FAILED', message: 'The article needs attention before publishing.', issues } });
    const { rows } = await pool.query(
      `UPDATE articles a SET status = 'published',
              published_at = COALESCE(a.published_at, now()), updated_at = now()
         FROM channels c
        WHERE a.id = $1 AND c.id = a.channel_id AND c.owner_user_id = $2
       RETURNING a.id, a.slug, a.title, a.published_at, c.username AS author_username`,
      [id.data, req.auth.userId]
    );
    return res.json({ article: rows[0], publicPath: `/${rows[0].author_username}/${rows[0].slug}` });
  } catch (error) { next(error); }
});

articleAuthoringRoutes.delete('/:articleId', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `UPDATE articles a SET status = 'archival', updated_at = now()
         FROM channels c
        WHERE a.id = $1 AND c.id = a.channel_id AND c.owner_user_id = $2
       RETURNING a.id`,
      [id.data, req.auth.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    return res.status(204).end();
  } catch (error) { next(error); }
});
